import { BATCH_CAP, type BatchRequest } from "../close";
import { ageInDays } from "../detect";
import { t, type LocaleCode } from "../i18n";
import type { TrafficLightEntry, UrEntry } from "../scanner";
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

export function formatStatus(entries: readonly UrEntry[]): string {
  if (entries.length === 0) return t("stateNone");
  const found = t("stateFound", { count: entries.length });
  const pending = entries.filter((e) => e.triage === "pending").length;
  return pending > 0
    ? `${found}, ${t("statePending", { count: pending })}`
    : found;
}

export function formatRowLabel(
  entry: TrafficLightEntry,
  locale: LocaleCode,
): string {
  const date = new Date(entry.reportedOn).toLocaleDateString(locale);
  return `#${entry.id} · ${entry.lang.toUpperCase()} · ${date}`;
}

export function formatStaleRowLabel(
  entry: TrafficLightEntry,
  locale: LocaleCode,
  now: number,
): string {
  const age = t("rowAgeDays", { count: ageInDays(entry.reportedOn, now) });
  return `${formatRowLabel(entry, locale)} · ${age}`;
}

/**
 * What the single batch button covers: each family only when its box is ticked AND the
 * editor has its level. Traffic lights on a freeway have no place here, whatever is ticked.
 */
export function selectedBatch(
  criteria: Criteria,
  allowed: { speedCamera: boolean; stale: boolean },
  ready: BatchRequest,
): BatchRequest {
  const takeCameras = criteria.speedCamera && allowed.speedCamera;
  const takeStale = criteria.stale && allowed.stale;
  return {
    speedCamera: takeCameras ? [...ready.speedCamera] : [],
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
