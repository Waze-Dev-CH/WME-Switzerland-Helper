import type {
  ConversationElement,
  MapUpdateRequest,
  WmeSDK,
} from "wme-sdk-typings";
import { alreadyMessaged, wasMessaged } from "./close";
import {
  hasDiscussion,
  isInExtent,
  isOnFreeway,
  isSpeedCameraUr,
  isStaleCandidate,
  isTrafficLightUr,
  triage,
  type Triage,
} from "./detect";
import type { LocaleCode } from "./i18n";
import { log } from "./log";
import { messageLanguage } from "./message";

export interface UrEntry {
  id: number;
  lon: number;
  lat: number;
  reportedOn: number;
  lang: LocaleCode;
  /** "pending" until the conversation is read: no action is offered on it meanwhile. */
  triage: Triage | "pending";
}

/** No triage: traffic lights are handled one by one, their conversation is read on click. */
export type TrafficLightEntry = Omit<UrEntry, "triage">;

/** "pending" until the conversation is read; a UR found to have one leaves the list. */
export interface StaleEntry extends TrafficLightEntry {
  state: "pending" | "stale";
}

export interface ScanSnapshot {
  entries: UrEntry[];
  trafficLights: TrafficLightEntry[];
  stale: StaleEntry[];
}

const DEBOUNCE_MS = 300;
const MODEL = "mapUpdateRequests";
/** Tracked because a traffic light's verdict depends on the road under it. */
const SEGMENTS = "segments";

/**
 * Keeps the list of speed-camera URs on screen.
 *
 * The data model already holds the URs with their description, so finding them costs
 * nothing; only the conversation needs a server round trip, and only for the URs that
 * matched. Those are read one after the other and remembered until WME reports the UR as
 * changed.
 */
export class Scanner {
  private triageCache = new Map<number, Triage>();
  /** true = abandoned, false = someone wrote. Kept when the box is unchecked. */
  private staleCache = new Map<number, boolean>();
  /** Bumped by forget(), so a read that was in flight when the UR changed is not cached. */
  private versions = new Map<number, number>();
  private snapshot: ScanSnapshot = { entries: [], trafficLights: [], stale: [] };
  private trafficLights: TrafficLightEntry[] = [];
  private staleCandidates: MapUpdateRequest[] = [];
  /**
   * Off by default: every old UR on screen costs a server round trip. The tab turns it on
   * when the editor checks "abandoned", then schedules a rescan itself.
   */
  private readStale = false;
  private listeners: Array<(snapshot: ScanSnapshot) => void> = [];
  /** Bumped by every rescan, so a slow one stops publishing once a newer one started. */
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private now: () => number;

  constructor(
    private sdk: WmeSDK,
    options: { now?: () => number } = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  setReadStale(on: boolean): void {
    this.readStale = on;
  }

  start(): void {
    for (const dataModelName of [MODEL, SEGMENTS] as const) {
      try {
        // Data-model events only fire for tracked models.
        this.sdk.Events.trackDataModelEvents({ dataModelName });
      } catch (err) {
        log.warn(
          `Could not track ${dataModelName}; the list follows map moves only`,
          err,
        );
      }
    }
    const onModelEvent =
      (changed: boolean) =>
      (payload: {
        dataModelName: string;
        objectIds: Array<string | number>;
      }) => {
        if (payload.dataModelName === SEGMENTS) {
          this.schedule();
          return;
        }
        if (payload.dataModelName !== MODEL) return;
        // A changed UR may have gained a comment or been reopened by an undo.
        if (changed) this.forget(payload.objectIds);
        this.schedule();
      };
    this.sdk.Events.on({
      eventName: "wme-data-model-objects-added",
      eventHandler: onModelEvent(false),
    });
    this.sdk.Events.on({
      eventName: "wme-data-model-objects-changed",
      eventHandler: onModelEvent(true),
    });
    this.sdk.Events.on({
      eventName: "wme-data-model-objects-removed",
      eventHandler: onModelEvent(false),
    });
    this.sdk.Events.on({
      eventName: "wme-map-move-end",
      eventHandler: () => this.schedule(),
    });
    this.schedule();
  }

  onUpdate(listener: (snapshot: ScanSnapshot) => void): void {
    this.listeners.push(listener);
  }

  getSnapshot(): ScanSnapshot {
    return this.snapshot;
  }

  forget(ids: ReadonlyArray<string | number>): void {
    for (const id of ids) {
      const key = Number(id);
      this.triageCache.delete(key);
      this.staleCache.delete(key);
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    }
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.rescan(), DEBOUNCE_MS);
  }

  async rescan(): Promise<void> {
    const generation = ++this.generation;
    const extent = this.sdk.Map.getMapExtent();
    const onScreen = this.sdk.DataModel.MapUpdateRequests.getAll()
      .filter((ur) => isInExtent(ur, extent))
      .sort((a, b) => a.reportedOn - b.reportedOn);
    const found = onScreen.filter(isSpeedCameraUr);

    const candidates = onScreen.filter(isTrafficLightUr);
    const segments =
      candidates.length > 0 ? this.sdk.DataModel.Segments.getAll() : [];
    const lights = candidates.filter((ur) => isOnFreeway(ur, segments));
    this.trafficLights = lights.map((ur) => this.basics(ur));

    // A traffic light on a freeway stays a traffic light: as "abandoned" it would reach a
    // batch, which that family must never do.
    const lightIds = new Set(lights.map((ur) => ur.id));
    const now = this.now();
    this.staleCandidates = this.readStale
      ? onScreen.filter(
          (ur) => isStaleCandidate(ur, now) && !lightIds.has(ur.id),
        )
      : [];
    this.publish(found);

    for (const ur of found) {
      if (this.triageCache.has(ur.id)) continue;
      const comments = await this.readConversation(ur.id, generation);
      if (comments)
        this.triageCache.set(
          ur.id,
          triage(comments, alreadyMessaged(ur.id, comments)),
        );
      if (generation !== this.generation) return;
      this.publish(found);
    }

    // After the speed cameras: those carry a message the reporter is waiting for.
    for (const ur of this.staleCandidates) {
      if (this.staleCache.has(ur.id)) continue;
      const comments = await this.readConversation(ur.id, generation);
      if (comments) this.staleCache.set(ur.id, !hasDiscussion(comments));
      if (generation !== this.generation) return;
      this.publish(found);
    }
  }

  /**
   * null on failure, absence, or when a newer scan or a change to the UR overtook the read:
   * the UR then stays pending and the next scan retries.
   */
  private async readConversation(
    id: number,
    generation: number,
  ): Promise<ConversationElement[] | null> {
    const version = this.versions.get(id) ?? 0;
    try {
      const details =
        await this.sdk.DataModel.MapUpdateRequests.getUpdateRequestDetails({
          mapUpdateRequestId: id,
        });
      const overtaken =
        generation !== this.generation ||
        version !== (this.versions.get(id) ?? 0);
      return details && !overtaken ? details.comments : null;
    } catch (err) {
      log.warn(`Could not read the conversation of UR ${id}`, err);
      return null;
    }
  }

  private publish(found: MapUpdateRequest[]): void {
    this.snapshot = {
      entries: found.map((ur) => this.toEntry(ur)),
      trafficLights: this.trafficLights,
      stale: this.staleCandidates.flatMap((ur) => this.toStaleEntry(ur)),
    };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  /** Empty when someone wrote: the UR is not abandoned and has nothing to do here. */
  private toStaleEntry(ur: MapUpdateRequest): StaleEntry[] {
    const verdict = this.staleCache.get(ur.id);
    if (verdict === false || wasMessaged(ur.id)) return [];
    const state = verdict === true ? "stale" : "pending";
    return [{ ...this.basics(ur), state }];
  }

  private toEntry(ur: MapUpdateRequest): UrEntry {
    // Checked at every publish rather than cached: a Ctrl+Z reopens a UR we already messaged.
    const cached = wasMessaged(ur.id)
      ? "conversation"
      : this.triageCache.get(ur.id);
    return { ...this.basics(ur), triage: cached ?? "pending" };
  }

  private basics(ur: MapUpdateRequest): TrafficLightEntry {
    const [lon = 0, lat = 0] = ur.geometry.coordinates;
    return {
      id: ur.id,
      lon,
      lat,
      reportedOn: ur.reportedOn,
      lang: messageLanguage(ur.userPreferences?.language),
    };
  }
}
