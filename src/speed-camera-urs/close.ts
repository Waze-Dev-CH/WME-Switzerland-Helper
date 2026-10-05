import type { ConversationElement, WmeSDK } from "wme-sdk-typings";
import { isSpeedCameraUr, triage } from "./detect";
import { getLocale, t } from "./i18n";
import { log } from "./log";
import { closeAllSpec, closeOneSpec, closeOnlySpec } from "./confirm-spec";
import { buildMessage, isOfficialMessage, messageLanguage } from "./message";
import {
  confirmDialog,
  notifyDialog,
  type Confirm,
  type Notify,
} from "./prompt";

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

/**
 * URs closeOne is working on right now. The message cannot be withdrawn and `messaged` is
 * only filled after the send resolves, so a double click, or a batch overlapping a single
 * click, would otherwise let two calls both read an empty conversation and both send.
 */
const inFlight = new Set<number>();

export function wasMessaged(id: number): boolean {
  return messaged.has(id);
}

export function noteMessaged(id: number): void {
  messaged.add(id);
}

/** Tests only: module state would otherwise leak from one test into the next. */
export function resetMessagedForTests(): void {
  messaged.clear();
  inFlight.clear();
}

/**
 * Whether the reporter already has our message: sent this session, or found in the
 * conversation itself, which is what survives a reload when the closure was never saved.
 */
export function alreadyMessaged(
  id: number,
  comments: readonly ConversationElement[],
): boolean {
  return (
    wasMessaged(id) ||
    comments.some((comment) => isOfficialMessage(comment.text))
  );
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
 * minutes old. The UR's own state is live, but getUpdateRequestDetails may hand back the
 * conversation already held in WME's data model (the SDK offers no forced refresh), so a
 * comment added seconds ago elsewhere can still be missing. The message goes FIRST because it cannot be withdrawn, while the closure
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

  if (inFlight.has(id))
    return { id, result: "skipped", reason: "skipConversation" };
  inFlight.add(id);
  try {
    return await sendAndClose(sdk, id, ur, options);
  } finally {
    inFlight.delete(id);
  }
}

type SpeedCameraUr = NonNullable<
  ReturnType<WmeSDK["DataModel"]["MapUpdateRequests"]["getById"]>
>;

async function sendAndClose(
  sdk: WmeSDK,
  id: number,
  ur: SpeedCameraUr,
  options: { allowConversation: boolean },
): Promise<CloseOutcome> {
  const urs = sdk.DataModel.MapUpdateRequests;
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

  const messagedBefore = alreadyMessaged(id, comments);
  const hasConversation = triage(comments, messagedBefore) === "conversation";
  if (hasConversation && !options.allowConversation) {
    return { id, result: "skipped", reason: "skipConversation" };
  }

  // The editor chose to handle a UR that came back after an undo or an unsaved session. The
  // reporter already has our message and it cannot be withdrawn, so close it without
  // sending a second one.
  if (messagedBefore) return closeWithoutMessage(urs, id);

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

function closeWithoutMessage(
  urs: WmeSDK["DataModel"]["MapUpdateRequests"],
  id: number,
): CloseOutcome {
  try {
    urs.updateResolutionState({
      mapUpdateRequestId: id,
      resolutionState: "not-identified",
    });
  } catch (err) {
    log.warn(`UR ${id} could not be closed`, err);
    return { id, result: "failed", reason: "errClose" };
  }
  return { id, result: "closed" };
}

export interface Prompts {
  confirm?: Confirm;
  notify?: Notify;
}

let flowRunning = false;

export function isCloseInFlight(): boolean {
  return flowRunning;
}

/**
 * Runs `work` unless another flow is already running, in which case null. The lock is held
 * from the confirmation on, so a double click or a batch started while a single UR's dialog
 * is open cannot send anything twice.
 */
async function withCloseLock<T>(work: () => Promise<T>): Promise<T | null> {
  if (flowRunning) return null;
  flowRunning = true;
  try {
    return await work();
  } finally {
    flowRunning = false;
  }
}

/**
 * One UR, from the tab. Open to every level: closing one by one is how an editor learns.
 * The confirmation shows the exact text and its language, and says when a conversation is
 * already there or when the message already left this session.
 */
export function runCloseOne(
  sdk: WmeSDK,
  id: number,
  prompts: Prompts = {},
): Promise<CloseOutcome | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  return withCloseLock(async () => {
    const urs = sdk.DataModel.MapUpdateRequests;
    const ur = urs.getById({ mapUpdateRequestId: id });
    if (!ur) return null;

    let comments: ConversationElement[] = [];
    try {
      comments =
        (await urs.getUpdateRequestDetails({ mapUpdateRequestId: id }))
          ?.comments ?? [];
    } catch {
      // closeOne reads it again and reports the failure properly.
    }

    // The reporter already has the message and it cannot be withdrawn: offer to close only.
    if (alreadyMessaged(id, comments)) {
      const accepted = await confirm(closeOnlySpec(id));
      if (!accepted) return null;
      const outcome = await closeOne(sdk, id, { allowConversation: true });
      if (outcome.result !== "closed") await notify(summarize([outcome]));
      return outcome;
    }

    const lang = messageLanguage(ur.userPreferences?.language);
    const hasConversation = triage(comments, false) === "conversation";
    // When the conversation could not be read there is no last comment to show, and the
    // plain confirmation stands, as before.
    const last = comments[comments.length - 1];
    const accepted = await confirm(
      closeOneSpec(id, lang, hasConversation && last ? last.text : null),
    );
    if (!accepted) return null;

    // Allowed only when the editor was actually warned: a comment arriving while the dialog
    // was open still stops the send.
    const outcome = await closeOne(sdk, id, {
      allowConversation: hasConversation,
    });
    if (outcome.result !== "closed") await notify(summarize([outcome]));
    return outcome;
  });
}

/** Every ready UR at once, level 3 and up. The rank is checked before anything is asked. */
export async function runCloseAll(
  sdk: WmeSDK,
  ids: readonly number[],
  prompts: Prompts = {},
): Promise<CloseOutcome[] | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  if (!canBatch(sdk)) {
    await notify(t("errBatchRank", { level: BATCH_MIN_RANK + 1 }));
    return null;
  }
  const batch = ids.slice(0, BATCH_CAP);
  if (batch.length === 0) return [];
  // closeOne checks again per UR, but asking the editor to confirm a batch that can only
  // fail is a worse experience than saying so up front.
  if (!sdk.Editing.isEditingAllowed()) {
    await notify(t("errNotAllowedBatch"));
    return null;
  }

  return withCloseLock(async () => {
    const langs = batch.map((id) =>
      messageLanguage(
        sdk.DataModel.MapUpdateRequests.getById({ mapUpdateRequestId: id })
          ?.userPreferences?.language,
      ),
    );
    const accepted = await confirm(closeAllSpec(langs, getLocale()));
    if (!accepted) return null;

    const outcomes = await closeMany(sdk, batch);
    if (outcomes) await notify(summarize(outcomes));
    return outcomes;
  });
}
