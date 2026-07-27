import type { WmeSDK } from "wme-sdk-typings";
import type { Bbox } from "../geoadmin/types";
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
import { MAX_SNAP_DISTANCE_M, runImportPoint, runImportPoints } from "./import";
import type { Confirm, Notify } from "./prompt";
import { log } from "./log";
import type { AddressPointLayer } from "./map-layer";
import { strictnessOf, type SettingsStore } from "./settings";
import { computeStatuses, missingPoints, normalizeNumber, type StatusedPoint } from "./status";

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
  progress: { done: number; total: number } | null;
  error: string | null;
}

const EMPTY: Snapshot = {
  state: "idle",
  points: [],
  segmentId: null,
  streetName: "",
  missing: [],
  truncated: false,
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
  /**
   * Numbers created in this session that the server has not confirmed yet.
   *
   * `fetchHouseNumbers` is a server call and does NOT see pending edits, so a refetch
   * triggered by our own creations would report them as still missing. Without this set the
   * button comes back with the same list and a second click duplicates the whole batch.
   */
  private optimisticNumbers = new Set<string>();
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
    for (const eventName of [
      "wme-after-undo",
      "wme-no-edits",
      "wme-house-number-deleted",
      "wme-save-finished",
    ] as const) {
      this.sdk.Events.on({
        eventName,
        eventHandler: () => {
          // None of these events says WHICH number went away, so forget the whole set
          // rather than keep claiming a number exists. The refetch right after settles it.
          this.optimisticNumbers.clear();
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
    try {
      this.publish({ state: "fetching", error: null, progress: { done: 0, total: 0 } });
      const result = await this.fetcher.fetchBbox(bbox, undefined, (done, total) => {
        if (generation === this.generation) this.publish({ progress: { done, total } });
      });
      if (generation !== this.generation) return;
      this.points = result.points;
      truncated = result.truncatedKeys.length > 0;
    } catch (err) {
      if (generation !== this.generation) return;
      log.error("Could not load address points", err);
      this.publish({ state: "error", error: String(err), progress: null });
      return;
    }

    const segmentId = this.selectedSegmentId();
    if (segmentId === null) {
      this.existingNumbers = null;
      this.classify(generation, { segmentId: null, streetName: "", truncated, state: "idle" });
      return;
    }

    const names = segmentStreetNames(this.sdk, segmentId);
    const streetName = names[0] ?? "";
    // Show the points at once, but hold their MISSING verdict until the existing numbers
    // are known: a green point during the round trip invites a duplicate.
    if (options.refetchExisting || this.existingNumbers === null) this.existingNumbers = null;
    this.classify(generation, {
      segmentId,
      streetName,
      truncated,
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
      // The server answer ignores pending edits, so re-add what we know we created.
      // A number the server now reports is confirmed and no longer needs remembering.
      for (const number of this.optimisticNumbers) {
        if (existing.has(number)) this.optimisticNumbers.delete(number);
        else existing.add(number);
      }
      this.existingNumbers = existing;
      this.classify(generation, { segmentId, streetName, truncated, state: "idle", names });
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
      // A truncated tile makes the count a lower bound, so no bulk import is offered.
      missing: context.truncated ? [] : assignments,
      truncated: context.truncated,
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
      onComplete: () => this.markImported([point]),
    });
  }

  /** Bulk import of what is missing on the selected street. */
  async importMissing(): Promise<void> {
    const { segmentId, streetName, missing } = this.snapshot;
    if (segmentId === null || missing.length === 0) return;
    await runImportPoints(this.sdk, missing, segmentId, streetName, {
      ...this.prompts,
      // What we believe exists, pending edits included, so a stale list cannot duplicate.
      alreadyPresent: this.existingNumbers ?? this.optimisticNumbers,
      onComplete: () => this.markImported(missing.map((assignment) => assignment.point)),
    });
  }

  /**
   * Mark numbers as present without waiting for a refetch. `fetchHouseNumbers` may not see
   * unsaved edits, so this optimistic mark is what keeps a just-created number from being
   * offered again a second later.
   */
  private markImported(points: GwrPoint[]): void {
    for (const point of points) {
      const number = normalizeNumber(point.number);
      this.optimisticNumbers.add(number);
      this.existingNumbers?.add(number);
    }
    this.classify(this.generation, {
      segmentId: this.snapshot.segmentId,
      streetName: this.snapshot.streetName,
      truncated: this.snapshot.truncated,
      state: "idle",
    });
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
    this.layer.clear();
    this.publish({ ...EMPTY, state: "disabled" });
  }
}
