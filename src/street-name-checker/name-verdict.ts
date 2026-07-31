import type { StreetNameVerdict } from "../street-check-bridge";
import type { IssueStatus } from "./matching/evaluate";
import type { ScanSnapshot } from "./scan";

/**
 * Statuses that say nothing about the name.
 *
 * They come from `evaluateGuidelines` and concern the lock rank or the geometry, and they
 * only land in the issues map when no naming issue took the slot first. Reporting them as a
 * naming problem would flag perfectly named streets.
 */
const NOT_ABOUT_THE_NAME: ReadonlySet<IssueStatus> = new Set<IssueStatus>([
  "UNDER_LOCK",
  "OVER_LOCK",
  "MICRO_SEGMENT",
  "LOOP",
  "NARROW_MISUSE",
]);

export interface VerdictContext {
  getSnapshot: () => ScanSnapshot;
}

/**
 * Turn the checker's state into an answer another feature can trust.
 *
 * "Conform" comes from `nameConformIds`, never from the absence of an issue. A segment can
 * be missing from the issues map because it sat outside the fetched area, because its road
 * type is not checked, because the status was switched off, or because the finding was
 * dismissed as a false positive. In every one of those cases nothing was verified, and a
 * green "the name is fine" badge would vouch for work that never happened.
 */
export function createStreetNameProvider(ctx: VerdictContext) {
  return (segmentId: number): StreetNameVerdict => {
    const snapshot = ctx.getSnapshot();
    // Mid-scan, paused or errored, the map still holds the previous run's results.
    if (snapshot.state !== "done") return { kind: "unknown" };

    const issue = snapshot.issues.get(segmentId);
    // A lock or geometry finding leaves the name question to the name pass, which either
    // cleared this segment (it is in the set) or never looked at it.
    if (!issue || NOT_ABOUT_THE_NAME.has(issue.status)) {
      return snapshot.nameConformIds.has(segmentId) ? { kind: "conform" } : { kind: "unknown" };
    }
    return {
      kind: "mismatch",
      status: issue.status,
      suggestion: issue.suggestion,
    };
  };
}
