import type { StreetNameVerdict } from "../../street-check-bridge";
import type { ControllerState, Snapshot } from "../controller";
import { IMPORT_CAP } from "../import";
import { t, type StringKey } from "../i18n";
import type { PointStatus, StatusedPoint } from "../status";

/**
 * Presentation logic with no DOM, so it can be tested in the repo's Node environment.
 * Anything touching elements stays in tab.ts.
 */

export const STATE_KEYS: Record<ControllerState, StringKey> = {
  disabled: "stateIdle",
  idle: "stateIdle",
  "zoom-gated": "stateZoomGated",
  "area-gated": "stateAreaGated",
  "outside-ch": "stateOutsideCh",
  fetching: "stateFetching",
  "checking-existing": "stateCheckingExisting",
  error: "stateError",
};

export const LEGEND_KEYS: Record<PointStatus, StringKey> = {
  MISSING: "legendMissing",
  PRESENT: "legendPresent",
  OTHER_STREET: "legendOtherStreet",
  NEUTRAL: "legendNeutral",
};

export function formatState(snapshot: Snapshot): string {
  if (snapshot.state === "fetching" && snapshot.progress) {
    return t("stateFetching", {
      done: snapshot.progress.done,
      total: snapshot.progress.total,
    });
  }
  if (snapshot.state === "error") return t("stateError", { message: snapshot.error ?? "" });
  return t(STATE_KEYS[snapshot.state]);
}

export interface Counts {
  total: number;
  missing: number;
  present: number;
  otherStreet: number;
}

export function countByStatus(points: StatusedPoint[]): Counts {
  const counts: Counts = {
    total: points.length,
    missing: 0,
    present: 0,
    otherStreet: 0,
  };
  for (const entry of points) {
    if (entry.status === "MISSING") counts.missing++;
    else if (entry.status === "PRESENT") counts.present++;
    else if (entry.status === "OTHER_STREET") counts.otherStreet++;
  }
  return counts;
}

export function formatCounts(counts: Counts): string {
  const parts = [
    t("countMissing", { count: counts.missing }),
    t("countPresent", { count: counts.present }),
    t("countOtherStreet", { count: counts.otherStreet }),
  ];
  return `${t("countGwr", { count: counts.total })} · ${parts.join(" · ")}`;
}

/** Label of the bulk-import button, stating the cap when it applies. */
export function formatImportButton(missingCount: number): string {
  return missingCount > IMPORT_CAP
    ? t("btnImportMissingCapped", { cap: IMPORT_CAP, count: missingCount })
    : t("btnImportMissing", { count: missingCount });
}

export interface VerdictDisplay {
  text: string;
  className: string;
}

/**
 * How to show what the street-name checker thinks of the selected street's name.
 *
 * Returns null on "unknown", which is the important case: the checker may be off, still
 * scanning, or simply not looking at this road type. Showing a green "name is official"
 * badge then would vouch for something nobody verified.
 */
export function formatVerdict(verdict: StreetNameVerdict): VerdictDisplay | null {
  if (verdict.kind === "conform") return { text: t("verdictOk"), className: "hn-verdict-ok" };
  if (verdict.kind === "mismatch") {
    return {
      text: t("verdictMismatch", { suggestion: verdict.suggestion ?? "?" }),
      className: "hn-verdict-mismatch",
    };
  }
  return null;
}

/**
 * Whether the bulk-import button may be shown at all. Hidden rather than disabled when it
 * does not apply: a greyed-out button still invites the click.
 *
 * The rule lives with the data (controller.ts) because `importMissing` enforces it again;
 * this re-export only keeps the UI's import list in one place.
 */
export { canBulkImport } from "../controller";

/** The warning to show above the counts, or null when the data covers the whole view. */
export function dataWarning(snapshot: Snapshot): string | null {
  if (snapshot.truncated) return t("warnTruncated");
  if (snapshot.incomplete) return t("warnIncomplete");
  return null;
}
