import type { ConversationElement, WmeSDK } from "wme-sdk-typings";
import { isSpeedCameraUr, triage } from "./detect";
import { t } from "./i18n";
import { log } from "./log";
import { buildMessage, messageLanguage } from "./message";

/**
 * Lowest rank allowed to handle every UR at once. WME's displayed level is rank + 1, so
 * this is editor level 3, the same gate as GROUP_FIX_MIN_RANK in the street-name checker.
 */
export const BATCH_MIN_RANK = 2;

/**
 * Most URs a single batch may handle. Enforced in closeMany rather than in the button, like
 * IMPORT_CAP: a limit living in the UI is one missed check away from being gone.
 */
export const BATCH_CAP = 50;

export type SkipReason = "skipGone" | "skipConversation";
export type FailReason =
  | "errNotAllowed"
  | "errDetails"
  | "errComment"
  | "errClose";

export type CloseOutcome =
  | { id: number; result: "closed" }
  | { id: number; result: "skipped"; reason: SkipReason }
  | { id: number; result: "failed"; reason: FailReason };

/**
 * URs this session already sent the message to.
 *
 * The closure goes to the undo stack, the comment does not. After a Ctrl+Z the UR is open
 * again while the reporter already has the message, and the conversation WME keeps in
 * memory may not show our comment yet. This set is what stops a second pass from sending
 * it twice.
 */
const messaged = new Set<number>();

export function wasMessaged(id: number): boolean {
  return messaged.has(id);
}

export function noteMessaged(id: number): void {
  messaged.add(id);
}

/** Tests only: module state would otherwise leak from one test into the next. */
export function resetMessagedForTests(): void {
  messaged.clear();
}

/** An unknown rank counts as insufficient. */
export function canBatch(sdk: WmeSDK): boolean {
  const rank = sdk.State.getUserInfo()?.rank;
  return typeof rank === "number" && rank >= BATCH_MIN_RANK;
}

/**
 * Send the official message to one UR's reporter, then close the UR as not-identified.
 *
 * Everything is re-read here, right before writing: the list the editor clicked may be
 * minutes old. The message goes FIRST because it cannot be withdrawn, while the closure
 * lands on the undo stack; a failed send must leave the UR open and untouched, never
 * closed without an explanation. Nothing is saved.
 */
export async function closeOne(
  sdk: WmeSDK,
  id: number,
  options: { allowConversation: boolean },
): Promise<CloseOutcome> {
  if (!sdk.Editing.isEditingAllowed())
    return { id, result: "failed", reason: "errNotAllowed" };

  const urs = sdk.DataModel.MapUpdateRequests;
  const ur = urs.getById({ mapUpdateRequestId: id });
  if (!ur || !isSpeedCameraUr(ur))
    return { id, result: "skipped", reason: "skipGone" };

  let comments: ConversationElement[];
  try {
    const details = await urs.getUpdateRequestDetails({
      mapUpdateRequestId: id,
    });
    if (!details) return { id, result: "failed", reason: "errDetails" };
    comments = details.comments;
  } catch (err) {
    log.warn(`Could not read the conversation of UR ${id}`, err);
    return { id, result: "failed", reason: "errDetails" };
  }

  const hasConversation = triage(comments, wasMessaged(id)) === "conversation";
  if (hasConversation && !options.allowConversation) {
    return { id, result: "skipped", reason: "skipConversation" };
  }

  const text = buildMessage(messageLanguage(ur.userPreferences?.language));
  try {
    await urs.addComment({ mapUpdateRequestId: id, text });
  } catch (err) {
    log.warn(`Could not send the message to UR ${id}`, err);
    return { id, result: "failed", reason: "errComment" };
  }
  noteMessaged(id);

  try {
    urs.updateResolutionState({
      mapUpdateRequestId: id,
      resolutionState: "not-identified",
    });
  } catch (err) {
    log.warn(`Message sent but UR ${id} could not be closed`, err);
    return { id, result: "failed", reason: "errClose" };
  }
  return { id, result: "closed" };
}

/**
 * The batch. Re-checks the rank itself: two surfaces could call it, and a gate enforced
 * only where the button is drawn would be one missed check away from being gone.
 */
export async function closeMany(
  sdk: WmeSDK,
  ids: readonly number[],
): Promise<CloseOutcome[] | null> {
  if (!canBatch(sdk)) return null;
  const outcomes: CloseOutcome[] = [];
  // One at a time: gentler on the server, and a failure costs one UR rather than a burst.
  for (const id of ids.slice(0, BATCH_CAP)) {
    outcomes.push(await closeOne(sdk, id, { allowConversation: false }));
  }
  return outcomes;
}

/** What the editor reads once a flow ends: counts, each problem by UR, and the save reminder. */
export function summarize(outcomes: readonly CloseOutcome[]): string {
  const count = (result: CloseOutcome["result"]) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const lines = [
    t("summary", {
      closed: count("closed"),
      skipped: count("skipped"),
      failed: count("failed"),
    }),
  ];
  for (const outcome of outcomes) {
    if (outcome.result === "closed") continue;
    lines.push(t("summaryLine", { id: outcome.id, reason: t(outcome.reason) }));
  }
  if (count("closed") > 0) lines.push("", t("saveReminder"));
  return lines.join("\n");
}
