import { BATCH_CAP, type BatchRequest } from "../close";
import { ageInDays } from "../detect";
import { t, type LocaleCode } from "../i18n";
import { kindLabel } from "../message";
import type {
  MapMateEntry,
  ScanSnapshot,
  StaleEntry,
  TrafficLightEntry,
  UrEntry,
} from "../scanner";
import type { Criteria } from "../settings";

/** The tab's wording, kept free of DOM so it can be tested. */

export interface Lists {
  ready: UrEntry[];
  conversation: UrEntry[];
  pending: UrEntry[];
}

export function splitEntries(entries: readonly UrEntry[]): Lists {
  return {
    ready: entries.filter((e) => e.triage === "ready"),
    conversation: entries.filter((e) => e.triage === "conversation"),
    pending: entries.filter((e) => e.triage === "pending"),
  };
}

/** One flag per UR of a ticked family: true while its conversation is still being read. */
export function formatStatus(
  snapshot: ScanSnapshot,
  criteria: Criteria,
): string {
  const anyFamily =
    criteria.speedCamera ||
    criteria.trafficLight ||
    criteria.mapMate ||
    criteria.stale;
  if (!anyFamily) return t("stateNoFamily");

  const pendingFlags = [
    ...(criteria.speedCamera
      ? snapshot.entries.map((e) => e.triage === "pending")
      : []),
    ...(criteria.trafficLight ? snapshot.trafficLights.map(() => false) : []),
    ...(criteria.mapMate
      ? snapshot.mapMate.map((e) => e.state === "pending")
      : []),
    ...(criteria.stale ? snapshot.stale.map((e) => e.state === "pending") : []),
  ];
  if (pendingFlags.length === 0) return t("stateNone");
  const found = t("stateFound", { count: pendingFlags.length });
  const pending = pendingFlags.filter(Boolean).length;
  return pending > 0
    ? `${found}, ${t("statePending", { count: pending })}`
    : found;
}

export function formatMapMateRowLabel(
  entry: MapMateEntry,
  locale: LocaleCode,
): string {
  const date = new Date(entry.reportedOn).toLocaleDateString(locale);
  return `#${entry.id} · ${kindLabel(entry.kind)} · ${entry.lang.toUpperCase()} · ${date}`;
}

export function formatRowLabel(
  entry: TrafficLightEntry,
  locale: LocaleCode,
): string {
  const date = new Date(entry.reportedOn).toLocaleDateString(locale);
  return `#${entry.id} · ${entry.lang.toUpperCase()} · ${date}`;
}

/** The days counted are those without any activity, not the report's age. */
export function formatStaleRowLabel(
  entry: StaleEntry,
  locale: LocaleCode,
  now: number,
): string {
  const age = t("rowAgeDays", { count: ageInDays(entry.lastActivity, now) });
  return `${formatRowLabel(entry, locale)} · ${age}`;
}

/**
 * What the single batch button covers: each family only when its box is ticked AND the
 * editor has its level. Traffic lights on a freeway have no place here, whatever is ticked.
 */
export function selectedBatch(
  criteria: Criteria,
  allowed: { speedCamera: boolean; mapMate: boolean; stale: boolean },
  ready: BatchRequest,
): BatchRequest {
  const takeCameras = criteria.speedCamera && allowed.speedCamera;
  const takeMapMate = criteria.mapMate && allowed.mapMate;
  const takeStale = criteria.stale && allowed.stale;
  return {
    speedCamera: takeCameras ? [...ready.speedCamera] : [],
    mapMate: takeMapMate ? [...ready.mapMate] : [],
    stale: takeStale ? [...ready.stale] : [],
  };
}

export function formatCloseSelectedButton(total: number): string {
  if (total > BATCH_CAP)
    return t("btnCloseSelectedCapped", { cap: BATCH_CAP, count: total });
  return t("btnCloseSelected", { count: total });
}

/**
 * Hidden, not greyed, when empty. The level is already folded into the total by
 * selectedBatch: a greyed button still invites the click.
 */
export function shouldShowCloseSelected(total: number): boolean {
  return total > 0;
}
