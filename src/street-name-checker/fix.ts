import type { UserRank, WmeSDK } from "wme-sdk-typings";
import { t } from "./i18n";
import { log } from "./log";
import { issueKey, type Issue } from "./matching/evaluate";
import { type Confirm, confirmDialog, type Notify, notifyDialog } from "./prompt";
import type { Settings, SettingsStore } from "./settings";

export const GROUP_FIX_CAP = 50;
export const GROUP_FIX_CONFIRM_THRESHOLD = 20;

/**
 * Minimum rank for fixing a whole group at once. Same scale and same value as
 * LOCK_DEFAULT_MIN_RANK: WME's displayed level = rank + 1, so this is editor level 3.
 *
 * The script is public, so a first-day editor can install it. Renaming up to
 * GROUP_FIX_CAP segments in one click is the one action here that can do damage at
 * scale, and unlike the per-segment fix it gives no chance to look at what is changing.
 * Fixing segments one by one stays open to everyone: that is how you learn to read what
 * the tool is telling you.
 */
export const GROUP_FIX_MIN_RANK = 2;

/** Lock-level issues: fixed by setting the lock rank, not by applying a name. */
export const LOCK_STATUSES = new Set<Issue["status"]>(["UNDER_LOCK", "OVER_LOCK"]);

/**
 * Statuses whose verdict rests on geometry rather than on a name similarity, so a wrong
 * one replaces a perfectly good name instead of tidying it up. They always confirm,
 * however few segments are involved.
 */
const GEOMETRY_STATUSES = new Set<Issue["status"]>(["WRONG_STREET"]);

/**
 * Whether this editor may fix a whole group. Read from the SDK rather than passed in, the
 * same way fixLock already reads it. An unknown rank counts as insufficient: it does not
 * happen on a normal start (index.ts reads the rank after wme-ready), so closing the case
 * costs nothing.
 */
export function canGroupFix(sdk: WmeSDK): boolean {
  const userRank = sdk.State.getUserInfo()?.rank;
  return typeof userRank === "number" && userRank >= GROUP_FIX_MIN_RANK;
}

/** Error codes double as i18n string keys (see src/i18n.ts). */
export type FixErrorCode =
  | "errNotFixable"
  | "errEditingNotAllowed"
  | "errSegmentUnloaded"
  | "errNoCity"
  | "errStreetCreate"
  | "errGroupFixRank";

export interface FixOutcome {
  segmentId: number;
  ok: boolean;
  errorCode?: FixErrorCode;
  /** Raw message for unexpected SDK errors (not localized). */
  errorDetail?: string;
}

export function formatFixError(outcome: FixOutcome): string {
  if (outcome.errorCode) return t(outcome.errorCode);
  return outcome.errorDetail ?? "?";
}

/** Find an existing Street by name in the city, or create it; null if neither works. */
function findOrCreateStreet(sdk: WmeSDK, streetName: string, cityId: number) {
  const existing = sdk.DataModel.Streets.getStreet({ streetName, cityId });
  if (existing) return existing;
  try {
    return sdk.DataModel.Streets.addStreet({ streetName, cityId });
  } catch {
    return sdk.DataModel.Streets.getStreet({ streetName, cityId });
  }
}

/**
 * Apply the suggested official name to a segment: find or create the Street
 * record in the segment's city, then update the segment's primary address.
 * Never saves; the editor reviews and saves with the native WME flow.
 */
export function fixSegment(sdk: WmeSDK, issue: Issue, settings: Settings): FixOutcome {
  const segmentId = issue.segmentId;
  const fail = (errorCode: FixErrorCode): FixOutcome => ({ segmentId, ok: false, errorCode });

  // Lock issues have no suggestion; handle before the name-fix gate below.
  if (LOCK_STATUSES.has(issue.status)) return fixLock(sdk, issue);

  if (!issue.fixable || !issue.suggestion) return fail("errNotFixable");
  if (!sdk.Editing.isEditingAllowed()) return fail("errEditingNotAllowed");

  try {
    const segment = sdk.DataModel.Segments.getById({ segmentId });
    if (!segment) return fail("errSegmentUnloaded");
    const address = sdk.DataModel.Segments.getAddress({ segmentId });
    const cityId = address.city?.id;
    if (cityId == null) return fail("errNoCity");

    const street = findOrCreateStreet(sdk, issue.suggestion, cityId);
    if (!street) return fail("errStreetCreate");

    // Alternates must be passed back explicitly so they are preserved.
    const alternateStreetIds = [...segment.alternateStreetIds];
    if (
      settings.keepOldNameAsAlt &&
      issue.status !== "NEAR" && // never keep a typo as alternate
      segment.primaryStreetId != null &&
      segment.primaryStreetId !== street.id &&
      !alternateStreetIds.includes(segment.primaryStreetId)
    ) {
      alternateStreetIds.push(segment.primaryStreetId);
    }

    // Bilingual labels ("Unterer Quai / Quai du Bas"): add the other language(s) as
    // alternates. The BILINGUAL check carries them; for a slash-in-primary fix the primary
    // also changes, for a missing-alternate fix only the alternates grow.
    if (issue.note?.altLabels) {
      for (const name of issue.note.altLabels) {
        const alt = findOrCreateStreet(sdk, name, cityId);
        if (alt && alt.id !== street.id && !alternateStreetIds.includes(alt.id)) {
          alternateStreetIds.push(alt.id);
        }
      }
    }

    // No empty edit: nothing changed (stale list, repeated group fix). The alternates array
    // only ever grows here, so an unchanged length means no alternate was added.
    const primaryChanged = segment.primaryStreetId !== street.id;
    const altsChanged = alternateStreetIds.length !== segment.alternateStreetIds.length;
    if (!primaryChanged && !altsChanged) return { segmentId, ok: true };

    sdk.DataModel.Segments.updateAddress({
      segmentId,
      primaryStreetId: street.id,
      alternateStreetIds,
    });
    return { segmentId, ok: true };
  } catch (err) {
    log.error(`Fix failed for segment ${segmentId}`, err);
    return {
      segmentId,
      ok: false,
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Apply the expected lock rank (carried in the issue note) to a segment.
 * Never saves. A target above the editor's own rank is rejected by the SDK and
 * surfaced through errorDetail, like any other unexpected failure.
 */
function fixLock(sdk: WmeSDK, issue: Issue): FixOutcome {
  const segmentId = issue.segmentId;
  const fail = (errorCode: FixErrorCode): FixOutcome => ({ segmentId, ok: false, errorCode });

  // The note carries the expected lock LEVEL (1-6); the SDK lockRank is 0-based.
  const expectedLevel = issue.note?.expectedLock;
  if (expectedLevel == null) return fail("errNotFixable");
  if (!sdk.Editing.isEditingAllowed()) return fail("errEditingNotAllowed");

  // WME forbids locking above your own editor level. Report it in 1-6 level terms
  // instead of leaking WME's raw 0-based "lock rank" wording.
  const userRank = sdk.State.getUserInfo()?.rank;
  if (typeof userRank === "number" && expectedLevel > userRank + 1) {
    return {
      segmentId,
      ok: false,
      errorDetail: t("errLockAboveRank", { expected: expectedLevel, user: userRank + 1 }),
    };
  }

  try {
    const segment = sdk.DataModel.Segments.getById({ segmentId });
    if (!segment) return fail("errSegmentUnloaded");
    const targetRank = expectedLevel - 1;
    // Already at the expected level (stale list, repeated group fix): no empty edit.
    if (segment.lockRank === targetRank) return { segmentId, ok: true };
    sdk.DataModel.Segments.updateSegment({ segmentId, lockRank: targetRank as UserRank });
    return { segmentId, ok: true };
  } catch (err) {
    log.error(`Lock fix failed for segment ${segmentId}`, err);
    return {
      segmentId,
      ok: false,
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Sequential group fix; stops at the first error. Hard-capped.
 * Yields to the event loop between segments so the UI can repaint progress.
 */
export async function fixGroup(
  sdk: WmeSDK,
  issues: Issue[],
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<FixOutcome[]> {
  const outcomes: FixOutcome[] = [];
  const batch = issues.slice(0, GROUP_FIX_CAP);
  for (const issue of batch) {
    const outcome = fixSegment(sdk, issue, settings);
    outcomes.push(outcome);
    onProgress?.(outcomes.length, batch.length);
    if (!outcome.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return outcomes;
}

let fixInFlight = false;

export function isFixInFlight(): boolean {
  return fixInFlight;
}

/**
 * Re-entrance guard shared by every fix button (sidebar tab, edit-panel box,
 * shortcuts): while one application runs, further fix clicks are ignored.
 * Returns null when the lock is already held.
 */
export async function withFixLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (fixInFlight) return null;
  fixInFlight = true;
  try {
    return await fn();
  } finally {
    fixInFlight = false;
  }
}

/** UI plumbing shared by the fix runners: optional button feedback + post-fix hook. */
export interface FixUiHooks {
  /** Disabled and used as a progress label while the fix runs. */
  button?: HTMLButtonElement;
  /** Called after a fix actually ran (not when the re-entrance lock was held). */
  onComplete?: () => void;
  /** Overridable so the fix flows can be tested without a DOM. */
  confirm?: Confirm;
  notify?: Notify;
}

/**
 * Confirm + locked single-segment fix with button feedback. Shared by the sidebar
 * tab and the edit-panel box so the OVER_LOCK confirm, failure alert and progress
 * wording stay in one place. The only per-UI difference is onComplete.
 */
export async function runFix(
  sdk: WmeSDK,
  issue: Issue,
  settings: Settings,
  { button, onComplete, confirm = confirmDialog, notify = notifyDialog }: FixUiHooks = {},
): Promise<void> {
  // Lowering an over-lock is often unwanted; confirm before applying.
  if (
    issue.status === "OVER_LOCK" &&
    !(await confirm(t("confirmOverLockFix", { n: issue.note?.expectedLock ?? "" })))
  ) {
    return;
  }
  // A geometric verdict renames a street that reads as perfectly valid, and until now it
  // was the one destructive fix with no confirmation at all, while lowering a lock (a
  // click to undo) always asked. The confidence figures travel with the prompt.
  if (GEOMETRY_STATUSES.has(issue.status)) {
    // Composed here rather than through ui/format.ts: the domain layer should not reach
    // into the presentation one for a string.
    const detail =
      issue.note?.coverage !== undefined
        ? `\n${t("noteMatchConfidence", {
            pct: Math.round(issue.note.coverage * 100),
            m: issue.note.matchDistanceM ?? 0,
          })}`
        : "";
    const confirmed = await confirm(
      t("confirmWrongStreetFix", {
        current: issue.currentName ?? "",
        suggestion: issue.suggestion ?? "",
      }) + detail,
    );
    if (!confirmed) return;
  }
  const result = await withFixLock(async () => {
    if (button) {
      button.disabled = true;
      button.textContent = "…";
    }
    const outcome = fixSegment(sdk, issue, settings);
    if (!outcome.ok) await notify(t("fixFailed", { error: formatFixError(outcome) }));
    return outcome;
  });
  // null = another fix was already running; its own completion will re-render.
  if (result !== null) onComplete?.();
}

/** The status/wording a group fix needs for its confirm prompts. */
export interface GroupFixHeader {
  status: Issue["status"];
  expectedLock?: number | string | null;
  suggestion?: string | null;
  /** Shown in the confirmation so it states the change, not just a count. */
  currentName?: string | null;
}

/** Confirm + locked sequential group fix with progress + stop-on-error reporting. */
export async function runFixGroup(
  sdk: WmeSDK,
  issues: Issue[],
  header: GroupFixHeader,
  settings: Settings,
  { button, onComplete, confirm = confirmDialog, notify = notifyDialog }: FixUiHooks = {},
): Promise<void> {
  // Defence in depth: two UIs build the group buttons, and a missed check in either one
  // would silently reopen the door. The refusal lives with the action, not with the
  // button that triggers it.
  if (!canGroupFix(sdk)) {
    await notify(t("errGroupFixRank", { level: GROUP_FIX_MIN_RANK + 1 }));
    return;
  }
  const n = Math.min(issues.length, GROUP_FIX_CAP);
  if (header.status === "OVER_LOCK") {
    if (!(await confirm(t("confirmOverLockFix", { n: header.expectedLock ?? "" })))) return;
  } else if (
    // Geometry-driven verdicts confirm every time, even for a single segment: a wrong
    // one renames a correctly named street. Volume alone is the wrong yardstick here.
    (GEOMETRY_STATUSES.has(header.status) || n > GROUP_FIX_CONFIRM_THRESHOLD) &&
    !(await confirm(
      t("confirmGroupFixDetailed", {
        n,
        current: header.currentName ?? "",
        suggestion: header.suggestion ?? "",
      }),
    ))
  ) {
    return;
  }
  const result = await withFixLock(async () => {
    if (button) button.disabled = true;
    const outcomes = await fixGroup(sdk, issues, settings, (done, total) => {
      if (button) button.textContent = `${done}/${total}…`;
    });
    const failed = outcomes.find((o) => !o.ok);
    if (failed) {
      await notify(
        t("fixStopped", {
          done: outcomes.filter((o) => o.ok).length,
          total: n,
          error: formatFixError(failed),
          id: failed.segmentId,
        }),
      );
    }
    return outcomes;
  });
  if (result !== null) onComplete?.();
}

/** Dismiss a finding as a false positive (local, reversible via Settings → Reset). */
export function ignoreIssue(settings: SettingsStore, issue: Issue, onComplete?: () => void): void {
  const keys = settings.get().ignoredKeys;
  const key = issueKey(issue);
  if (!keys.includes(key)) settings.update({ ignoredKeys: [...keys, key] });
  onComplete?.();
}

/** Dismiss a whole group of findings at once; confirms a large mass-hide first. */
export async function ignoreIssues(
  settings: SettingsStore,
  issues: Issue[],
  onComplete?: () => void,
  confirm: Confirm = confirmDialog,
): Promise<void> {
  // Reversible (Settings → Reset), but confirm a large mass-hide to avoid accidents.
  if (
    issues.length > GROUP_FIX_CONFIRM_THRESHOLD &&
    !(await confirm(t("confirmIgnoreAll", { n: issues.length })))
  ) {
    return;
  }
  const keys = new Set(settings.get().ignoredKeys);
  for (const issue of issues) keys.add(issueKey(issue));
  settings.update({ ignoredKeys: [...keys] });
  onComplete?.();
}
