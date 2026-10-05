import { BATCH_CAP } from "../close";
import { t, type LocaleCode } from "../i18n";
import type { UrEntry } from "../scanner";

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

export function formatRowLabel(entry: UrEntry, locale: LocaleCode): string {
  const date = new Date(entry.reportedOn).toLocaleDateString(locale);
  return `#${entry.id} · ${entry.lang.toUpperCase()} · ${date}`;
}

export function formatCloseAllButton(readyCount: number): string {
  if (readyCount > BATCH_CAP)
    return t("btnCloseAllCapped", { cap: BATCH_CAP, count: readyCount });
  return t("btnCloseAll", { count: readyCount });
}

/** Hidden, not greyed, below the level: a greyed button still invites the click. */
export function shouldShowCloseAll(
  allowed: boolean,
  readyCount: number,
): boolean {
  return allowed && readyCount > 0;
}
