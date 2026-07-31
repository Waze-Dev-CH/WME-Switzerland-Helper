import type { WmeSDK } from "wme-sdk-typings";
import type { Bbox } from "../geoadmin/types";
import { k1 } from "../street-name-checker/matching/normalize";
import { intersectsSwitzerland } from "../street-name-checker/scan";
import {
  assignToSegments,
  readSegmentGeometries,
  type Assignment,
  type SegmentGeometries,
} from "./assign";
import {
  collectStreetScopedSegmentIds,
  fetchExistingNumbers,
  segmentStreetNames,
} from "./existing";
import { GwrTileFetcher, tileKeysForBbox } from "./gwr/tiles";
import type { GwrPoint } from "./gwr/types";
import { MAX_SNAP_DISTANCE_M, runImportPoint, runImportPoints, type ImportOutcome } from "./import";
import type { Confirm, Notify } from "./prompt";
import { log } from "./log";
import type { AddressPointLayer } from "./map-layer";
import { strictnessOf, type SettingsStore } from "./settings";
import { computeStatuses, missingPoints, normalizeNumber, type StatusedPoint } from "./status";

/**
 * Key of an optimistic creation: the street it was created on, then the number.
 *
 * `k1` is the checker's street-name key (case folded, apostrophes and dashes unified), so
 * "Rue du Lac" and "rue du lac" are one street while the same number on another street
 * stays a different key. The separator is a NUL, which no street name or house number can
 * contain: with a plain space, "rue du lac" would be a prefix of "rue du lac nord" and
 * reading a key back would return "nord 15" as a house number.
 */
const KEY_SEPARATOR = "\u0000";

function optimisticKey(streetName: string, normalizedNumber: string): string {
  return `${k1(streetName)}${KEY_SEPARATOR}${normalizedNumber}`;
}

/** The number an optimistic key holds, or null when the key belongs to another street. */
function numberOfKey(key: string, streetName: string): string | null {
  const prefix = `${k1(streetName)}${KEY_SEPARATOR}`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

const MOVE_DEBOUNCE_MS = 400;
const EDIT_DEBOUNCE_MS = 300;
/** A viewport at z17 spans 4 to 6 tiles; well past that the editor should zoom in. */
const MAX_TILES_PER_FETCH = 20;

export type ControllerState =
  | "disabled"
  | "idle"
  | "zoom-gated"
  | "area-gated"
  | "outside-ch"
  | "fetching"
  | "checking-existing"
  | "error";

export interface Snapshot {
  state: ControllerState;
  points: StatusedPoint[];
  /** Selected segment, or null. */
  segmentId: number | null;
  streetName: string;
  /**
   * Missing numbers, each already paired with the segment of that street it will hang
   * from. Empty until a selection resolves.
   */
  missing: Assignment[];
  /** A tile covering the view was cut at the page cap: counts cannot be trusted. */
  truncated: boolean;
  /** A tile failed to load: part of the view holds no addresses at all, silently. */
  incomplete: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
}

/**
 * Whether a bulk import may be offered at all.
 *
 * Lives with the data rather than with the buttons: two UIs build them and `importMissing`
 * checks it again, so a missed check in one surface cannot reopen the door. A truncated or
 * failed tile makes "N missing" a count the feature cannot vouch for, and a one-click
 * import of an unknown count is precisely what must not be offered.
 */
export function canBulkImport(snapshot: Snapshot): boolean {
  return (
    snapshot.segmentId !== null &&
    !snapshot.truncated &&
    !snapshot.incomplete &&
    snapshot.missing.length > 0
  );
}

const EMPTY: Snapshot = {
  state: "idle",
  points: [],
  segmentId: null,
  streetName: "",
  missing: [],
  truncated: false,
  incomplete: false,
  progress: null,
  error: null,
};

/**
 * Turns map state into what the layer and the UI show: fetch the address points covering
 * the view, read what already exists on the selected street, classify, publish.
 *
 * Every asynchronous step is guarded by a generation counter, so a pass superseded by a
 * pan or a new selection never publishes stale points over fresh ones.
 */
export class Controller {
  private snapshot: Snapshot = EMPTY;
  private listeners: Array<(snapshot: Snapshot) => void> = [];
  private generation = 0;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private editTimer: ReturnType<typeof setTimeout> | null = null;
  private points: GwrPoint[] = [];
  private existingNumbers: Set<string> | null = null;
  /** Segment `existingNumbers` was read for; another one means the set says nothing. */
  private existingForSegmentId: number | null = null;
  /**
   * Numbers created in this session that the server has not confirmed yet, keyed by street.
   *
   * `fetchHouseNumbers` is a server call and does NOT see pending edits, so a refetch
   * triggered by our own creations would report them as still missing. Without this set the
   * button comes back with the same list and a second click duplicates the whole batch.
   *
   * Keyed by street and not by number alone: "15" on Rue du Lac says nothing about "15" on
   * Rue des Alpes, and the bare number silently marked the second one as already there.
   * Insertion order is the undo order, which is what `forgetLastCreation` walks back.
   */
  private optimisticKeys = new Set<string>();
  /** Geometry of every segment of the selected street, for assigning each number. */
  private geometries: SegmentGeometries = new Map();

  constructor(
    private sdk: WmeSDK,
    private fetcher: GwrTileFetcher,
    private settings: SettingsStore,
    private layer: AddressPointLayer,
    /** Injectable dialogs, so the import flows can be exercised without a DOM. */
    private prompts: { confirm?: Confirm; notify?: Notify } = {},
  ) {}

  start(): void {
    this.sdk.Events.on({
      eventName: "wme-map-move-end",
      eventHandler: () => this.scheduleRefresh(MOVE_DEBOUNCE_MS),
    });
    this.sdk.Events.on({
      eventName: "wme-selection-changed",
      eventHandler: () => void this.refresh(),
    });
    for (const eventName of [
      "wme-house-number-added",
      "wme-house-number-updated",
      "wme-house-number-moved",
    ] as const) {
      this.sdk.Events.on({
        eventName,
        eventHandler: () => this.scheduleReclassify(EDIT_DEBOUNCE_MS),
      });
    }
    // Anything that can remove a number we remember creating. Ctrl+Z is the common case and
    // it does NOT emit wme-house-number-deleted, so listening for that alone left the
    // undone numbers looking like they still existed, greyed out instead of green.
    // `wme-save-finished` is here too: once saved, the server knows them and the refetch
    // becomes the source of truth again.
    // Nothing is pending any more, or the server now knows everything: the refetch is the
    // truth again and the whole optimistic set can go.
    for (const eventName of ["wme-no-edits", "wme-save-finished"] as const) {
      this.sdk.Events.on({
        eventName,
        eventHandler: () => {
          this.optimisticKeys.clear();
          this.scheduleReclassify(EDIT_DEBOUNCE_MS);
        },
      });
    }
    // One edit went away. Ctrl+Z is the everyday case and it does NOT emit
    // wme-house-number-deleted, so both are listened to.
    for (const eventName of ["wme-after-undo", "wme-house-number-deleted"] as const) {
      this.sdk.Events.on({
        eventName,
        eventHandler: () => {
          this.forgetLastCreation();
          this.scheduleReclassify(EDIT_DEBOUNCE_MS);
        },
      });
    }
    this.sdk.Events.on({
      eventName: "wme-layer-feature-clicked",
      eventHandler: ({ featureId }) => void this.onFeatureClicked(featureId),
    });
    void this.refresh();
  }

  onUpdate(listener: (snapshot: Snapshot) => void): void {
    this.listeners.push(listener);
  }

  getSnapshot(): Snapshot {
    return this.snapshot;
  }

  private publish(partial: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.layer.sync(this.snapshot.points);
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.moveTimer) clearTimeout(this.moveTimer);
    this.moveTimer = setTimeout(() => void this.refresh(), delayMs);
  }

  private scheduleReclassify(delayMs: number): void {
    if (this.editTimer) clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => void this.refresh({ refetchExisting: true }), delayMs);
  }

  /** Selected segment id, or null when the selection is anything else. */
  private selectedSegmentId(): number | null {
    const selection = this.sdk.Editing.getSelection();
    if (selection?.objectType !== "segment" || selection.ids.length !== 1) return null;
    const id = selection.ids[0];
    return typeof id === "number" ? id : null;
  }

  private viewport(): Bbox | null {
    try {
      const extent = this.sdk.Map.getMapExtent();
      return [extent[0], extent[1], extent[2], extent[3]] as Bbox;
    } catch {
      return null;
    }
  }

  /** Reload the view: address points, then existing numbers, then classification. */
  async refresh(options: { refetchExisting?: boolean } = {}): Promise<void> {
    const generation = ++this.generation;
    const settings = this.settings.get();
    if (!settings.enabled) {
      this.points = [];
      this.publish({ ...EMPTY, state: "disabled" });
      return;
    }

    const bbox = this.viewport();
    if (!bbox) return;
    if (this.sdk.Map.getZoomLevel() < settings.minZoom) {
      this.points = [];
      this.publish({ ...EMPTY, state: "zoom-gated" });
      return;
    }
    if (!intersectsSwitzerland(bbox)) {
      this.points = [];
      this.publish({ ...EMPTY, state: "outside-ch" });
      return;
    }
    if (tileKeysForBbox(bbox).length > MAX_TILES_PER_FETCH) {
      this.points = [];
      this.publish({ ...EMPTY, state: "area-gated" });
      return;
    }

    let truncated = false;
    let incomplete = false;
    try {
      this.publish({
        state: "fetching",
        error: null,
        progress: { done: 0, total: 0 },
      });
      const result = await this.fetcher.fetchBbox(bbox, undefined, (done, total) => {
        if (generation === this.generation) this.publish({ progress: { done, total } });
      });
      if (generation !== this.generation) return;
      this.points = result.points;
      truncated = result.truncatedKeys.length > 0;
      // A failed tile is silent: its addresses simply are not there, so the view looks
      // complete while a whole block is missing. Same treatment as a truncated one.
      incomplete = result.failedKeys.length > 0;
    } catch (err) {
      if (generation !== this.generation) return;
      log.error("Could not load address points", err);
      this.publish({ state: "error", error: String(err), progress: null });
      return;
    }

    const segmentId = this.selectedSegmentId();
    if (segmentId === null) {
      this.existingNumbers = null;
      this.existingForSegmentId = null;
      this.classify(generation, {
        segmentId: null,
        streetName: "",
        truncated,
        incomplete,
        state: "idle",
      });
      return;
    }

    const names = segmentStreetNames(this.sdk, segmentId);
    const streetName = names[0] ?? "";
    // Show the points at once, but hold their MISSING verdict until the existing numbers
    // are known: a green point during the round trip invites a duplicate. The numbers of
    // the street we were on before say nothing about this one, so they go too.
    if (options.refetchExisting || segmentId !== this.existingForSegmentId) {
      this.existingNumbers = null;
    }
    this.existingForSegmentId = segmentId;
    this.classify(generation, {
      segmentId,
      streetName,
      truncated,
      incomplete,
      state: "checking-existing",
      names,
    });

    try {
      const segmentIds = collectStreetScopedSegmentIds(this.sdk, segmentId, bbox);
      // The same scope answers both questions: which segments may already carry a number,
      // and which one each new number should hang from.
      this.geometries = readSegmentGeometries(this.sdk, segmentIds);
      const existing = await fetchExistingNumbers(this.sdk, segmentIds);
      if (generation !== this.generation) return;
      // The server answer ignores pending edits, so re-add what we know we created ON THIS
      // STREET. A number the server now reports is confirmed and stops being remembered.
      for (const key of [...this.optimisticKeys]) {
        const number = numberOfKey(key, streetName);
        if (number === null) continue;
        if (existing.has(number)) this.optimisticKeys.delete(key);
        else existing.add(number);
      }
      this.existingNumbers = existing;
      this.classify(generation, {
        segmentId,
        streetName,
        truncated,
        incomplete,
        state: "idle",
        names,
      });
    } catch (err) {
      if (generation !== this.generation) return;
      this.publish({ state: "error", error: String(err), progress: null });
    }
  }

  private classify(
    generation: number,
    context: {
      segmentId: number | null;
      streetName: string;
      truncated: boolean;
      incomplete: boolean;
      state: ControllerState;
      names?: string[];
    },
  ): void {
    if (generation !== this.generation) return;
    const settings = this.settings.get();
    const segmentNames =
      context.segmentId === null
        ? null
        : (context.names ?? segmentStreetNames(this.sdk, context.segmentId));
    const statused = computeStatuses({
      points: this.points,
      segmentNames,
      existingNumbers: this.existingNumbers,
      strictness: strictnessOf(settings),
    });
    // Each missing number hangs from the segment of its own street it actually stands on,
    // not from the selected one: a street is several segments, and number 2 can be four
    // hundred metres from the piece the editor happened to click.
    const { assignments } = assignToSegments(
      missingPoints(statused),
      this.geometries,
      MAX_SNAP_DISTANCE_M,
    );

    this.publish({
      state: context.state,
      points: statused,
      segmentId: context.segmentId,
      streetName: context.streetName,
      // Kept even when the data is partial: `canBulkImport` is what withholds the bulk
      // button, while each point keeps the segment it belongs to. Emptying this list left
      // the points clickable with no assignment, and the fallback hung them on the
      // selected segment, which on a corner is regularly the cross street.
      missing: assignments,
      truncated: context.truncated,
      incomplete: context.incomplete,
      progress: null,
      error: null,
    });
  }

  private async onFeatureClicked(featureId: string | number): Promise<void> {
    const point = this.layer.pointOf(featureId);
    if (!point) return;
    const { segmentId, streetName } = this.snapshot;
    if (segmentId === null || this.existingNumbers === null) return;

    const entry = this.snapshot.points.find((candidate) => candidate.point.id === point.id);
    if (entry?.status !== "MISSING") return;

    // Same rule as the bulk import: the number hangs from the piece of street it stands
    // on, which is not always the one the editor selected to get here.
    const target =
      this.snapshot.missing.find((assignment) => assignment.point.id === point.id)?.segmentId ??
      segmentId;

    await runImportPoint(this.sdk, point, target, streetName, {
      ...this.prompts,
      confirmSingle: this.settings.get().confirmSingleImport,
      onComplete: (outcomes) => this.markImported(outcomes),
    });
  }

  /** Bulk import of what is missing on the selected street. */
  async importMissing(): Promise<void> {
    // Checked again here, not only where the buttons are built: three surfaces trigger this.
    if (!canBulkImport(this.snapshot)) return;
    const { segmentId, streetName, missing } = this.snapshot;
    if (segmentId === null) return;
    await runImportPoints(this.sdk, missing, segmentId, streetName, {
      ...this.prompts,
      // What we believe exists, pending edits included, so a stale list cannot duplicate.
      alreadyPresent: this.existingNumbers ?? this.optimisticNumbersFor(streetName),
      onComplete: (outcomes) => this.markImported(outcomes),
    });
  }

  /**
   * Mark the numbers that were ACTUALLY created as present, without waiting for a refetch.
   * `fetchHouseNumbers` may not see unsaved edits, so this optimistic mark is what keeps a
   * just-created number from being offered again a second later. Failed creations, and
   * everything past the cap, are absent from the outcomes and stay offered.
   */
  private markImported(outcomes: ImportOutcome[]): void {
    const streetName = this.snapshot.streetName;
    for (const outcome of outcomes) {
      if (!outcome.ok) continue;
      const number = normalizeNumber(outcome.number);
      this.optimisticKeys.add(optimisticKey(streetName, number));
      this.existingNumbers?.add(number);
    }
    this.classify(this.generation, {
      segmentId: this.snapshot.segmentId,
      streetName,
      truncated: this.snapshot.truncated,
      incomplete: this.snapshot.incomplete,
      state: "idle",
    });
  }

  /** Numbers we believe we created on this street, pending edits included. */
  private optimisticNumbersFor(streetName: string): Set<string> {
    const numbers = new Set<string>();
    for (const key of this.optimisticKeys) {
      const number = numberOfKey(key, streetName);
      if (number !== null) numbers.add(number);
    }
    return numbers;
  }

  /**
   * Walk back the last remembered creation after an undo.
   *
   * ponytail: the events say an edit went away, never WHICH one, and the SDK exposes no way
   * to read the house numbers currently in the data model (only a server fetch, which
   * ignores pending edits). Dropping the most recent creation matches Ctrl+Z on our own
   * batch; when the undone edit was something else, one number goes back to "missing"
   * instead of the whole set, which is what used to happen. Upgrade path: resolve the
   * houseNumberId the events carry, the day the SDK lets anything read it back.
   */
  private forgetLastCreation(): void {
    let last: string | undefined;
    for (const key of this.optimisticKeys) last = key;
    if (last !== undefined) this.optimisticKeys.delete(last);
  }

  /** Drop both cache levels and reload. */
  async reload(): Promise<void> {
    this.fetcher.clearAll();
    await this.refresh({ refetchExisting: true });
  }

  disable(): void {
    this.generation++;
    this.points = [];
    this.existingNumbers = null;
    this.existingForSegmentId = null;
    this.layer.clear();
    this.publish({ ...EMPTY, state: "disabled" });
  }
}
