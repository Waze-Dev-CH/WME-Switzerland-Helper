import type { Segment, WmeSDK } from "wme-sdk-typings";
import { tileKeyForPoint, tileKeysForBbox, type TileFetcher } from "./geoadmin/tiles";
import type { Bbox } from "./geoadmin/types";
import { isFixInFlight } from "./fix";
import { evaluateGuidelines } from "./guidelines";
import { log } from "./log";
import { evaluateSegment, issueKey, type Issue } from "./matching/evaluate";
import { OfficialIndex } from "./matching/official-index";
import { distanceToLinesM, nearestOfficial, SpatialIndex } from "./matching/spatial";
import { findStreetLinesByName } from "./geoadmin/client";
import type { SettingsStore } from "./settings";

/** Switzerland bounding box (WGS84), generous margins for border viewports. */
export const CH_BBOX: Bbox = [5.9, 45.8, 10.6, 47.9];

export function intersectsSwitzerland(bbox: Bbox): boolean {
  return (
    bbox[0] <= CH_BBOX[2] && bbox[2] >= CH_BBOX[0] && bbox[1] <= CH_BBOX[3] && bbox[3] >= CH_BBOX[1]
  );
}

/** A segment is editable when the editor rank covers its lock. Rank unknown ⇒ all allowed (fail-open). */
export function isEditableByRank(lockRank: number, userRank: number | null): boolean {
  return userRank === null || userRank >= lockRank;
}

const DEBOUNCE_MS = 800;
const BBOX_PADDING_RATIO = 0.2; // covers the WME data-model buffer beyond the viewport
const MAX_AREA_KM2 = 6;
/** A NOT_FOUND name on a main road counts as an out-of-locality continuation
 *  when a same-named official axis lies within this distance. */
const CONTINUATION_MAX_M = 3000;
/** Primary Street, Freeway, Major Highway, Minor Highway. */
const CONTINUATION_ROAD_TYPES = new Set([2, 3, 6, 7]);
/** Nationwide find() lookups allowed per evaluation run (fair-use safety). */
const MAX_CONTINUATION_LOOKUPS_PER_RUN = 10;

export type ScanState =
  | "idle"
  | "disabled"
  | "outside-ch"
  | "zoom-gated"
  | "area-gated"
  | "fetching"
  | "evaluating"
  | "done"
  | "paused"
  | "error";

export interface ScanStats {
  ok: number;
  okAlt: number;
  skipped: number;
  total: number;
}

export interface ScanSnapshot {
  state: ScanState;
  issues: ReadonlyMap<number, Issue>;
  stats: ScanStats;
  officialStreetCount: number;
  progress: { done: number; total: number } | null;
  error: string | null;
  unsavedCount: number;
}

function padBbox(bbox: Bbox): Bbox {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const padLon = (maxLon - minLon) * BBOX_PADDING_RATIO;
  const padLat = (maxLat - minLat) * BBOX_PADDING_RATIO;
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
}

function bboxAreaKm2(bbox: Bbox): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const widthKm = (maxLon - minLon) * 111.32 * Math.cos((midLat * Math.PI) / 180);
  const heightKm = (maxLat - minLat) * 110.57;
  return widthKm * heightKm;
}

export class Scanner {
  private generation = 0;
  private evalGeneration = 0;
  private controller: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private reevalTimer: ReturnType<typeof setTimeout> | undefined;
  private lastIndex: OfficialIndex | null = null;
  private lastSpatialIndex: SpatialIndex | null = null;
  /** Tile keys covered by lastIndex; segments outside are not name-checked. */
  private coveredTiles: Set<string> | null = null;
  /** Session cache: street name -> nationwide official axis polylines (or null). */
  private nameLinesCache = new Map<string, number[][][] | null>();
  /** Resolved once; null = not found (guard disabled), undefined = not tried yet. */
  private swissCountryId: number | null | undefined;
  private listeners: Array<(snapshot: ScanSnapshot) => void> = [];
  private snapshot: ScanSnapshot = {
    state: "idle",
    issues: new Map(),
    stats: { ok: 0, okAlt: 0, skipped: 0, total: 0 },
    officialStreetCount: 0,
    progress: null,
    error: null,
    unsavedCount: 0,
  };
  paused = false;
  /** Until this timestamp, map-move events do not trigger an auto-scan
   *  (script-initiated navigation must not wipe the editor's working list). */
  private suppressAutoScanUntil = 0;

  constructor(
    private sdk: WmeSDK,
    private fetcher: TileFetcher,
    private settings: SettingsStore,
  ) {}

  start(): void {
    const onMove = () => {
      if (Date.now() < this.suppressAutoScanUntil) return;
      const s = this.settings.get();
      if (!s.enabled || !s.autoScan) return;
      this.requestScan();
    };
    this.sdk.Events.on({ eventName: "wme-map-move-end", eventHandler: onMove });
    this.sdk.Events.on({ eventName: "wme-map-data-loaded", eventHandler: onMove });
    this.sdk.Events.on({ eventName: "wme-after-edit", eventHandler: () => this.reevaluate() });
    this.sdk.Events.on({ eventName: "wme-save-finished", eventHandler: () => this.reevaluate() });
    this.requestScan();
  }

  /** Ignore auto-scan triggers for a short while (script-driven map moves). */
  suppressAutoScan(ms = 1500): void {
    this.suppressAutoScanUntil = Date.now() + ms;
  }

  onUpdate(listener: (snapshot: ScanSnapshot) => void): void {
    this.listeners.push(listener);
  }

  getSnapshot(): ScanSnapshot {
    return this.snapshot;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.controller?.abort();
      this.publish({ state: "paused" });
    } else {
      this.requestScan();
    }
  }

  requestScan(): void {
    if (this.paused) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.scan();
    }, DEBOUNCE_MS);
  }

  /** Full rescan ignoring the tile cache (e.g. after register daily update). */
  rescan(): void {
    this.fetcher.clearAll();
    this.lastIndex = null;
    this.lastSpatialIndex = null;
    this.coveredTiles = null;
    this.requestScan();
  }

  /** Disable everything: abort, clear results, publish the disabled state. */
  disable(): void {
    this.controller?.abort();
    clearTimeout(this.debounceTimer);
    this.publish({ state: "disabled", issues: new Map(), progress: null });
  }

  /**
   * Re-run evaluation against the last fetched official index, without
   * refetching. Debounced: wme-after-edit fires on EVERY WME edit (including
   * plain node moves) and a full synchronous re-evaluation per edit was the
   * main source of perceived jank while editing.
   */
  reevaluate(): void {
    // skip intermediate re-evaluations during a batch fix (one runs at the end)
    if (isFixInFlight()) return;
    clearTimeout(this.reevalTimer);
    this.reevalTimer = setTimeout(() => {
      const index = this.lastIndex;
      if (isFixInFlight() || this.paused || !this.settings.get().enabled || !index) return;
      void this.runEvaluation(index).then((completed) => {
        if (completed) this.publish({ state: "done" });
      });
    }, 300);
  }

  private async scan(): Promise<void> {
    if (this.paused) return;
    if (!this.settings.get().enabled) {
      this.disable();
      return;
    }
    const gen = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    try {
      const zoom = this.sdk.Map.getZoomLevel();
      if (zoom < this.settings.get().minZoom) {
        this.publish({ state: "zoom-gated", issues: new Map(), progress: null });
        return;
      }
      const bbox = padBbox(this.sdk.Map.getMapExtent() as Bbox);
      if (!intersectsSwitzerland(bbox)) {
        // abroad: stay silent, no API calls, no noise
        this.publish({ state: "outside-ch", issues: new Map(), progress: null });
        return;
      }
      if (bboxAreaKm2(bbox) > MAX_AREA_KM2) {
        this.publish({ state: "area-gated", issues: new Map(), progress: null });
        return;
      }

      this.publish({ state: "fetching", error: null });
      const streets = await this.fetcher.fetchBbox(bbox, controller.signal, (done, total) => {
        if (gen === this.generation) this.publish({ progress: { done, total } });
      });
      if (gen !== this.generation) return;

      this.publish({ state: "evaluating", progress: null });
      const index = new OfficialIndex(streets);
      this.lastIndex = index;
      this.lastSpatialIndex = new SpatialIndex(index.list);
      this.coveredTiles = new Set(tileKeysForBbox(bbox));
      const completed = await this.runEvaluation(index);
      if (!completed || gen !== this.generation) return;
      this.publish({ state: "done", officialStreetCount: index.streetCount });
    } catch (err) {
      if (controller.signal.aborted || gen !== this.generation) return;
      log.error("Scan failed", err);
      this.publish({ state: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Identify Switzerland in the loaded countries, by abbreviation or name in
   * any of the national languages. Resolved lazily and cached; null disables
   * the foreign-segment guard rather than excluding everything.
   */
  private resolveSwissCountryId(): number | null {
    if (this.swissCountryId !== undefined) return this.swissCountryId;
    try {
      const swiss = this.sdk.DataModel.Countries.getAll().find((country) => {
        const abbr = (country.abbr ?? "").toUpperCase();
        const name = (country.name ?? "").toLowerCase();
        return (
          abbr === "CH" ||
          abbr === "CHE" ||
          name === "switzerland" ||
          name === "schweiz" ||
          name === "suisse" ||
          name === "svizzera"
        );
      });
      this.swissCountryId = swiss ? swiss.id : null;
      if (this.swissCountryId === null) {
        log.warn("Switzerland not found in the countries data model; country guard disabled");
      }
    } catch {
      this.swissCountryId = null;
    }
    return this.swissCountryId;
  }

  /** Chunk size: keeps every main-thread task short while panning WME. */
  private static readonly EVAL_CHUNK = 250;

  /**
   * Evaluate all loaded segments in chunks, yielding to the event loop between
   * chunks. Returns false when superseded by a newer evaluation.
   */
  private async runEvaluation(index: OfficialIndex): Promise<boolean> {
    const gen = ++this.evalGeneration;
    const settings = this.settings.get();
    const issues = new Map<number, Issue>();
    const stats = { ok: 0, okAlt: 0, skipped: 0, total: 0 };
    const allSegments = this.sdk.DataModel.Segments.getAll();
    // "Editable only": drop segments locked above the current editor rank up front
    // so they vanish from the list, the map layer and the counters alike. Rank
    // unknown (e.g. not logged in) ⇒ fail-open, nothing is dropped.
    const userRank = settings.editableOnly ? (this.sdk.State.getUserInfo()?.rank ?? null) : null;
    const segments =
      userRank === null
        ? allSegments
        : allSegments.filter((seg) => isEditableByRank((seg as Segment).lockRank, userRank));
    // Findings the editor dismissed as false positives: dropped here so they vanish from
    // the list, the map layer and the counters alike.
    const ignored = new Set(settings.ignoredKeys);
    const spatial = settings.geometryMatching ? this.lastSpatialIndex : null;
    const swissCountryId = this.resolveSwissCountryId();
    for (let i = 0; i < segments.length; i++) {
      if (i > 0 && i % Scanner.EVAL_CHUNK === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (gen !== this.evalGeneration) return false;
      }
      const segment = segments[i] as Segment;
      stats.total++;
      // The WME data model loads segments well beyond the viewport; only
      // name-check those inside the area we actually fetched officials for,
      // otherwise every edge segment becomes a false NOT_FOUND.
      if (!this.isCovered(segment)) {
        stats.skipped++;
        continue;
      }
      let verdict;
      try {
        const address = this.sdk.DataModel.Segments.getAddress({ segmentId: segment.id });
        // spatial lookup only for road types we actually check
        const nearest =
          spatial && settings.checkedRoadTypes.includes(segment.roadType)
            ? nearestOfficial(segment.geometry, spatial)
            : null;
        verdict = evaluateSegment(segment, address, index, settings, nearest, swissCountryId);
      } catch {
        stats.skipped++;
        continue;
      }
      switch (verdict.kind) {
        case "ok":
          stats.ok++;
          break;
        case "okAlt":
          stats.okAlt++;
          break;
        case "skipped":
          stats.skipped++;
          break;
        case "issue":
          if (ignored.has(issueKey(verdict.issue))) {
            stats.skipped++;
          } else if (settings.enabledStatuses.includes(verdict.issue.status)) {
            issues.set(verdict.issue.segmentId, verdict.issue);
          } else {
            stats.skipped++;
          }
          break;
      }
    }
    if (!(await this.reclassifyContinuations(issues, stats, gen))) return false;
    if (gen !== this.evalGeneration) return false;
    // Lock checks are independent of the structural-guideline toggle: they run
    // whenever a lock status is enabled, so disabling micro/loop/narrow noise does
    // not silently kill lock detection.
    const lockEnabled =
      settings.enabledStatuses.includes("UNDER_LOCK") ||
      settings.enabledStatuses.includes("OVER_LOCK");
    if (settings.guidelineChecks || lockEnabled) {
      // Name issues keep precedence; guideline issues fill the remaining segments.
      const getAddress = (segmentId: number) => {
        try {
          return this.sdk.DataModel.Segments.getAddress({ segmentId });
        } catch {
          return null;
        }
      };
      const guidelineIssues = evaluateGuidelines(segments, getAddress, swissCountryId, {
        structural: settings.guidelineChecks,
      });
      for (const issue of guidelineIssues) {
        if (
          !issues.has(issue.segmentId) &&
          settings.enabledStatuses.includes(issue.status) &&
          !ignored.has(issueKey(issue))
        ) {
          issues.set(issue.segmentId, issue);
        }
      }
    }
    this.publish({ issues, stats, unsavedCount: this.safeUnsavedCount() });
    return true;
  }

  /**
   * Out-of-locality continuations: a NOT_FOUND name on a main road is accepted
   * when an official axis with the exact same name exists within 3 km, e.g.
   * "Route de Berne" between Payerne (where the register entry lives) and
   * Corcelles-près-Payerne (out of town, no register entry).
   * Returns false when superseded by a newer evaluation.
   */
  private async reclassifyContinuations(
    issues: Map<number, Issue>,
    stats: ScanStats,
    gen: number,
  ): Promise<boolean> {
    let lookups = 0;
    for (const issue of [...issues.values()]) {
      if (issue.status !== "NOT_FOUND" || !issue.currentName) continue;
      if (!CONTINUATION_ROAD_TYPES.has(issue.roadType)) continue;
      let lines = this.nameLinesCache.get(issue.currentName);
      if (lines === undefined) {
        if (lookups >= MAX_CONTINUATION_LOOKUPS_PER_RUN) continue;
        lookups++;
        try {
          lines = await findStreetLinesByName(issue.currentName, this.controller?.signal);
        } catch {
          continue; // aborted or network error: stays NOT_FOUND, retried next scan
        }
        if (gen !== this.evalGeneration) return false;
        this.nameLinesCache.set(issue.currentName, lines);
      }
      if (lines && distanceToLinesM(issue.geometry, lines) <= CONTINUATION_MAX_M) {
        issues.delete(issue.segmentId);
        stats.ok++;
      }
    }
    return true;
  }

  private isCovered(segment: Segment): boolean {
    const covered = this.coveredTiles;
    if (!covered) return true;
    return segment.geometry.coordinates.some(([lon, lat]) =>
      covered.has(tileKeyForPoint(lon as number, lat as number)),
    );
  }

  private safeUnsavedCount(): number {
    try {
      return this.sdk.Editing.getUnsavedChangesCount();
    } catch {
      return 0;
    }
  }

  private publish(partial: Partial<ScanSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial, unsavedCount: this.safeUnsavedCount() };
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (err) {
        log.error("Listener failed", err);
      }
    }
  }
}
