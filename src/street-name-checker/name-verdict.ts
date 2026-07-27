import type { WmeSDK } from "wme-sdk-typings";
import type { StreetNameVerdict } from "../street-check-bridge";
import type { IssueStatus } from "./matching/evaluate";
import type { ScanSnapshot } from "./scan";
import type { SettingsStore } from "./settings";

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
  sdk: WmeSDK;
  settings: SettingsStore;
  getSnapshot: () => ScanSnapshot;
}

/**
 * Is this segment one the checker actually has an opinion about?
 *
 * A segment of an unchecked road type, or one with no name, is never evaluated, so the
 * absence of an issue tells us nothing about it.
 */
function isCheckedAndNamed(sdk: WmeSDK, settings: SettingsStore, segmentId: number): boolean {
  try {
    const segment = sdk.DataModel.Segments.getById({ segmentId });
    if (!segment || !settings.get().checkedRoadTypes.includes(segment.roadType)) return false;
    const address = sdk.DataModel.Segments.getAddress({ segmentId });
    return Boolean(address.street?.name?.trim());
  } catch {
    return false;
  }
}

/**
 * Turn the checker's state into an answer another feature can trust.
 *
 * The issues map holds only the segments WITH a problem, so an absence has to be read
 * carefully: it means "conform" only once a scan has completed, and only for a segment the
 * checker actually looks at. Anything else is "unknown", and saying so is the whole point:
 * a green "the name is fine" badge on a street nobody checked would be worse than no badge.
 */
export function createStreetNameProvider(ctx: VerdictContext) {
  return (segmentId: number): StreetNameVerdict => {
    const snapshot = ctx.getSnapshot();
    // Mid-scan, paused or errored, the map still holds the previous run's results.
    if (snapshot.state !== "done") return { kind: "unknown" };

    const issue = snapshot.issues.get(segmentId);
    if (!issue) {
      return isCheckedAndNamed(ctx.sdk, ctx.settings, segmentId)
        ? { kind: "conform" }
        : { kind: "unknown" };
    }
    if (NOT_ABOUT_THE_NAME.has(issue.status)) return { kind: "conform" };
    return { kind: "mismatch", status: issue.status, suggestion: issue.suggestion };
  };
}
