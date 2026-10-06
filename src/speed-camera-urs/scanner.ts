import type { MapUpdateRequest, WmeSDK } from "wme-sdk-typings";
import { alreadyMessaged, wasMessaged } from "./close";
import {
  isInExtent,
  isOnFreeway,
  isSpeedCameraUr,
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

export interface ScanSnapshot {
  entries: UrEntry[];
  trafficLights: TrafficLightEntry[];
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
  /** Bumped by forget(), so a read that was in flight when the UR changed is not cached. */
  private versions = new Map<number, number>();
  private snapshot: ScanSnapshot = { entries: [], trafficLights: [] };
  private trafficLights: TrafficLightEntry[] = [];
  private listeners: Array<(snapshot: ScanSnapshot) => void> = [];
  /** Bumped by every rescan, so a slow one stops publishing once a newer one started. */
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sdk: WmeSDK) {}

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
    this.trafficLights = candidates
      .filter((ur) => isOnFreeway(ur, segments))
      .map((ur) => this.basics(ur));
    this.publish(found);

    for (const ur of found) {
      if (this.triageCache.has(ur.id)) continue;
      const version = this.versions.get(ur.id) ?? 0;
      try {
        const details =
          await this.sdk.DataModel.MapUpdateRequests.getUpdateRequestDetails({
            mapUpdateRequestId: ur.id,
          });
        // Not cached on failure or absence: the UR stays pending and the next scan retries.
        // A stale scan or a UR changed meanwhile read an outdated conversation: do not cache it.
        const overtaken =
          generation !== this.generation ||
          version !== (this.versions.get(ur.id) ?? 0);
        if (details && !overtaken)
          this.triageCache.set(
            ur.id,
            triage(details.comments, alreadyMessaged(ur.id, details.comments)),
          );
      } catch (err) {
        log.warn(`Could not read the conversation of UR ${ur.id}`, err);
      }
      if (generation !== this.generation) return;
      this.publish(found);
    }
  }

  private publish(found: MapUpdateRequest[]): void {
    this.snapshot = {
      entries: found.map((ur) => this.toEntry(ur)),
      trafficLights: this.trafficLights,
    };
    for (const listener of this.listeners) listener(this.snapshot);
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
