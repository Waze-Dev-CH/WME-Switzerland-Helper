import type { LineString } from "geojson";
import type { Bbox } from "../geoadmin/types";
import { t, type StringKey } from "../i18n";
import { type Issue, type IssueNote, type IssueStatus } from "../matching/evaluate";
import type { ScanSnapshot } from "../scan";

/**
 * Presentation helpers with no DOM and no class state, shared by the sidebar tab and the
 * edit-panel box. They used to live in tab.ts, which meant edit-panel.ts imported the
 * 1000-line tab module to reach four small functions.
 */

export const LEGEND_KEYS: Record<IssueStatus, StringKey> = {
  COSMETIC: "legendCOSMETIC",
  VARIANT: "legendVARIANT",
  NEAR: "legendNEAR",
  WRONG_TYPE: "legendWRONG_TYPE",
  BILINGUAL: "legendBILINGUAL",
  WRONG_STREET: "legendWRONG_STREET",
  WRONG_CITY: "legendWRONG_CITY",
  NOT_FOUND: "legendNOT_FOUND",
  UNNAMED: "legendUNNAMED",
  UNDER_LOCK: "legendUNDER_LOCK",
  MICRO_SEGMENT: "legendMICRO_SEGMENT",
  LOOP: "legendLOOP",
  NARROW_MISUSE: "legendNARROW_MISUSE",
  OVER_LOCK: "legendOVER_LOCK",
  UNNAMED_NO_MATCH: "legendUNNAMED_NO_MATCH",
};

export const STATE_KEYS: Record<ScanSnapshot["state"], StringKey> = {
  idle: "stateIdle",
  disabled: "stateDisabled",
  "outside-ch": "stateOutsideCh",
  "zoom-gated": "stateZoomGated",
  "area-gated": "stateAreaGated",
  fetching: "stateFetching",
  evaluating: "stateEvaluating",
  sweeping: "stateSweeping",
  done: "stateDone",
  paused: "statePaused",
  error: "stateError",
};

// isDarkBackground moved to src/ui/theme.ts, shared with the other feature panels.

/** Leading emoji for a status, or "" when none. WRONG_STREET is flagged: a different
 *  official street runs under a validly-named segment, easy to miss in the list. */
export function statusEmoji(status: IssueStatus): string {
  return status === "WRONG_STREET" ? "⚠️" : "";
}

export function formatNote(note: IssueNote | null): string {
  if (!note) return "";
  const parts: string[] = [];
  if (note.unofficial) parts.push(t("noteUnofficial"));
  if (note.planned) parts.push(t("notePlanned"));
  if (note.fullLabel) parts.push(t("noteFullLabel", { label: note.fullLabel }));
  if (note.existsIn) parts.push(t("noteExistsIn", { place: note.existsIn }));
  if (note.ownDistanceM !== undefined) parts.push(t("noteOwnDistance", { m: note.ownDistanceM }));
  // Confidence of the geometric match, spelled out: a verdict that renames a street
  // should say how sure it is, and a barely-cleared match should not read like a
  // unanimous one.
  if (note.coverage !== undefined) {
    parts.push(
      t("noteMatchConfidence", {
        pct: Math.round(note.coverage * 100),
        m: note.matchDistanceM ?? 0,
      }),
    );
  }
  if (note.runnerUpMarginM !== undefined) {
    parts.push(t("noteRunnerUp", { m: note.runnerUpMarginM }));
  }
  if (note.currentLock !== undefined && note.expectedLock !== undefined) {
    // currentLock / expectedLock are already 1-6 levels (see guidelines.ts).
    parts.push(t("noteLock", { current: note.currentLock, expected: note.expectedLock }));
  }
  return parts.join(", ");
}

export interface IssueGroup {
  key: string;
  status: IssueStatus;
  currentName: string | null;
  suggestion: string | null;
  note: IssueNote | null;
  fixable: boolean;
  issues: Issue[];
}

/** Display order: safe fixes first, then risky ones, unnamed and guideline checks last. */
const SEVERITY_ORDER: Record<IssueStatus, number> = {
  COSMETIC: 0,
  VARIANT: 1,
  BILINGUAL: 2,
  NEAR: 3,
  WRONG_TYPE: 4,
  WRONG_STREET: 5,
  WRONG_CITY: 6,
  NOT_FOUND: 7,
  UNNAMED: 8,
  UNDER_LOCK: 9,
  MICRO_SEGMENT: 10,
  LOOP: 11,
  NARROW_MISUSE: 12,
  OVER_LOCK: 13,
  UNNAMED_NO_MATCH: 14,
};

export function groupIssues(issues: Iterable<Issue>): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.status}|${issue.currentName ?? ""}|${issue.suggestion ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        status: issue.status,
        currentName: issue.currentName,
        suggestion: issue.suggestion,
        note: issue.note,
        fixable: issue.fixable,
        issues: [],
      };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] || b.issues.length - a.issues.length,
  );
}

/**
 * True when the segment's bounding box overlaps the viewport bbox. Using a
 * bbox overlap (rather than "a vertex falls inside") also keeps a long segment
 * that crosses the screen without any vertex inside it.
 */
export function geometryIntersectsBbox(geometry: LineString, bbox: Bbox): boolean {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const point of geometry.coordinates) {
    const lon = point[0] as number;
    const lat = point[1] as number;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) return false;
  return minLon <= bbox[2] && maxLon >= bbox[0] && minLat <= bbox[3] && maxLat >= bbox[1];
}

/**
 * Padded bounding box around every segment of a group, or null when no issue
 * carries coordinates. 30% padding with a floor so a single short segment
 * keeps street-level context.
 */
export function bboxOfIssues(issues: Issue[]): Bbox | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const issue of issues) {
    for (const point of issue.geometry.coordinates) {
      const lon = point[0] as number;
      const lat = point[1] as number;
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLon)) return null;
  const padLon = Math.max((maxLon - minLon) * 0.3, 0.001);
  const padLat = Math.max((maxLat - minLat) * 0.3, 0.0007);
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
}
