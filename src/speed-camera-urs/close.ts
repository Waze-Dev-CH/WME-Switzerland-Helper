import type { ConversationElement, WmeSDK } from "wme-sdk-typings";
import {
  ageInDays,
  isAbandoned,
  lastActivity,
  isKnownOffFreeway,
  isOnFreeway,
  isSpeedCameraUr,
  isStaleCandidate,
  isTrafficLightUr,
  mapMateKind,
  triage,
} from "./detect";
import { getLocale, t } from "./i18n";
import { log } from "./log";
import {
  askMapMateSpec,
  closeOneSpec,
  closeOnlySpec,
  closeSelectedSpec,
  closeStaleSpec,
  closeTrafficLightSpec,
} from "./confirm-spec";
import {
  buildMapMateQuestion,
  buildMessage,
  isOfficialMessage,
  mayAskMapMate,
  messageLanguage,
} from "./message";
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

/**
 * Lowest rank allowed to close abandoned URs in a batch: editor level 4. One level above
 * the speed cameras because the family is far wider, any type of UR, and a batch of it is
 * fifty closures nobody looked at one by one.
 */
export const STALE_BATCH_MIN_RANK = 3;

export type SkipReason = "skipGone" | "skipConversation" | "skipNotFreeway";
export type FailReason =
  | "errNotAllowed"
  | "errDetails"
  | "errComment"
  | "errClose";

export type CloseOutcome =
  | { id: number; result: "closed" }
  /** A Map Mate report was asked for details; nothing was closed. */
  | { id: number; result: "asked" }
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

export function canBatchStale(sdk: WmeSDK): boolean {
  const rank = sdk.State.getUserInfo()?.rank;
  return typeof rank === "number" && rank >= STALE_BATCH_MIN_RANK;
}

export interface BatchRequest {
  speedCamera: readonly number[];
  mapMate: readonly number[];
  stale: readonly number[];
}

/** Each family the editor lacks the rank for is emptied, the others go through. */
export function allowedBatch(sdk: WmeSDK, request: BatchRequest): BatchRequest {
  const level3 = canBatch(sdk);
  return {
    speedCamera: level3 ? request.speedCamera : [],
    mapMate: level3 ? request.mapMate : [],
    stale: canBatchStale(sdk) ? request.stale : [],
  };
}

/** Speed cameras first, then the reporters we ask; abandoned URs can wait. */
export function capBatch(request: BatchRequest): BatchRequest {
  const speedCamera = request.speedCamera.slice(0, BATCH_CAP);
  let room = BATCH_CAP - speedCamera.length;
  const mapMate = request.mapMate.slice(0, room);
  room -= mapMate.length;
  const stale = request.stale.slice(0, room);
  return { speedCamera, mapMate, stale };
}

function batchSize(request: BatchRequest): number {
  return (
    request.speedCamera.length + request.mapMate.length + request.stale.length
  );
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
 * Close one traffic light reported on a freeway, without any message. There is no batch
 * for these and none should be added: the prefix alone does not make a speed camera, the
 * editor looks at each one.
 *
 * Both conditions are checked again here rather than trusted from the list: the segment
 * may have been re-typed or unloaded since it was drawn, and a gate living only in the tab
 * would be one missed check away from being gone.
 */
export async function closeTrafficLight(
  sdk: WmeSDK,
  id: number,
): Promise<CloseOutcome> {
  if (!sdk.Editing.isEditingAllowed())
    return { id, result: "failed", reason: "errNotAllowed" };

  const urs = sdk.DataModel.MapUpdateRequests;
  const ur = urs.getById({ mapUpdateRequestId: id });
  if (!ur || !isTrafficLightUr(ur))
    return { id, result: "skipped", reason: "skipGone" };
  if (!isOnFreeway(ur, sdk.DataModel.Segments.getAll()))
    return { id, result: "skipped", reason: "skipNotFreeway" };

  return closeWithoutMessage(urs, id);
}

/**
 * Close one abandoned UR as not-identified, without any message: the reporter has not
 * looked at it in weeks, and the official text speaks of speed cameras.
 *
 * Re-checks everything right before writing, like closeOne: the list may be minutes old,
 * and a comment arriving since then means someone is talking to the reporter. Same
 * inFlight guard, so a double click does not start two reads.
 */
export async function closeStale(
  sdk: WmeSDK,
  id: number,
  now = Date.now(),
): Promise<CloseOutcome> {
  if (!sdk.Editing.isEditingAllowed())
    return { id, result: "failed", reason: "errNotAllowed" };

  const urs = sdk.DataModel.MapUpdateRequests;
  const ur = urs.getById({ mapUpdateRequestId: id });
  if (!ur || !isStaleCandidate(ur, now))
    return { id, result: "skipped", reason: "skipGone" };
  // Never through this door: traffic lights on a freeway have no batch at all, and one
  // whose road is not loaded may well be on a freeway.
  const lightBlocked =
    isTrafficLightUr(ur) &&
    !isKnownOffFreeway(ur, sdk.DataModel.Segments.getAll());
  if (lightBlocked) return { id, result: "skipped", reason: "skipGone" };

  if (inFlight.has(id)) {
    log.warn(`Abandoned UR ${id} skipped: already being handled`);
    return { id, result: "skipped", reason: "skipConversation" };
  }
  inFlight.add(id);
  try {
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
    const messaged = wasMessaged(id);
    const abandoned = isAbandoned(comments, ur.reportedOn, now);
    if (messaged || !abandoned) {
      // Everything the verdict was made of: the list said abandoned, this read says not.
      log.warn(`Abandoned UR ${id} skipped at closure`, {
        wasMessaged: messaged,
        isAbandoned: abandoned,
        reportedOn: describeTime(ur.reportedOn),
        now: describeTime(now),
        comments: comments.map((comment) => ({
          userName: comment.userName,
          createdOn: describeTime(comment.createdOn),
        })),
      });
      return { id, result: "skipped", reason: "skipConversation" };
    }
    return closeWithoutMessage(urs, id);
  } finally {
    inFlight.delete(id);
  }
}

/**
 * Ask a Map Mate reporter for details: one comment, and the UR stays open for the answer.
 * updateResolutionState is never called here.
 *
 * Everything is re-read right before sending, as in closeOne: the comment cannot be
 * withdrawn. There is no way to force it: once anyone but Map_Team has written, a canned
 * question would talk over them.
 */
export async function askMapMate(
  sdk: WmeSDK,
  id: number,
): Promise<CloseOutcome> {
  if (!sdk.Editing.isEditingAllowed())
    return { id, result: "failed", reason: "errNotAllowed" };

  const urs = sdk.DataModel.MapUpdateRequests;
  const ur = urs.getById({ mapUpdateRequestId: id });
  const kind = ur ? mapMateKind(ur) : null;
  if (!ur || !kind) return { id, result: "skipped", reason: "skipGone" };
  // On a freeway it is likely a speed camera; on an unloaded road it may be one.
  const lightOnUnknownRoad =
    kind === "trafficLight" &&
    !isKnownOffFreeway(ur, sdk.DataModel.Segments.getAll());
  if (lightOnUnknownRoad) return { id, result: "skipped", reason: "skipGone" };

  if (inFlight.has(id))
    return { id, result: "skipped", reason: "skipConversation" };
  inFlight.add(id);
  try {
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
    if (wasMessaged(id) || !mayAskMapMate(comments))
      return { id, result: "skipped", reason: "skipConversation" };

    const lang = messageLanguage(ur.userPreferences?.language);
    try {
      await urs.addComment({
        mapUpdateRequestId: id,
        text: buildMapMateQuestion(kind, lang),
      });
    } catch (err) {
      log.warn(`Could not send the question to UR ${id}`, err);
      return { id, result: "failed", reason: "errComment" };
    }
    noteMessaged(id);
    return { id, result: "asked" };
  } finally {
    inFlight.delete(id);
  }
}

/**
 * The batch. Re-checks both ranks itself: a gate enforced only where the button is drawn
 * would be one missed check away from being gone. null when the editor has the rank for
 * none of the families asked for.
 */
export async function closeMany(
  sdk: WmeSDK,
  request: BatchRequest,
  now = Date.now(),
): Promise<CloseOutcome[] | null> {
  const allowed = allowedBatch(sdk, request);
  if (batchSize(request) > 0 && batchSize(allowed) === 0) return null;

  const batch = capBatch(allowed);
  const outcomes: CloseOutcome[] = [];
  // One at a time: gentler on the server, and a failure costs one UR rather than a burst.
  for (const id of batch.speedCamera) {
    outcomes.push(await closeOne(sdk, id, { allowConversation: false }));
  }
  for (const id of batch.mapMate) {
    outcomes.push(await askMapMate(sdk, id));
  }
  for (const id of batch.stale) {
    outcomes.push(await closeStale(sdk, id, now));
  }
  return outcomes;
}

/**
 * What the editor reads once a flow ends: counts, each problem by UR, and the save reminder.
 * `messagesSent` is false for the traffic lights, which close without any message.
 */
export function summarize(
  outcomes: readonly CloseOutcome[],
  { messagesSent = true }: { messagesSent?: boolean } = {},
): string {
  const count = (result: CloseOutcome["result"]) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const lines = [
    t("summary", {
      closed: count("closed"),
      skipped: count("skipped"),
      failed: count("failed"),
    }),
  ];
  if (count("asked") > 0)
    lines.push(t("summaryAsked", { count: count("asked") }));
  for (const outcome of outcomes) {
    if (outcome.result === "closed" || outcome.result === "asked") continue;
    lines.push(t("summaryLine", { id: outcome.id, reason: t(outcome.reason) }));
  }
  // A question alone leaves nothing in the edit stack: there is nothing to save.
  const reminder = messagesSent ? "saveReminder" : "saveReminderNoMessage";
  if (count("closed") > 0) lines.push("", t(reminder));
  else if (count("asked") > 0) lines.push("", t("askedReminder"));
  return lines.join("\n");
}

/**
 * The batch's summary. It claims messages were sent only when a speed camera was actually
 * closed: a batch of abandoned URs sends nothing.
 */
export function summarizeBatch(
  outcomes: readonly CloseOutcome[],
  speedCameraIds: readonly number[],
): string {
  const cameras = new Set(speedCameraIds);
  const messagesSent = outcomes.some(
    (outcome) => outcome.result === "closed" && cameras.has(outcome.id),
  );
  return summarize(outcomes, { messagesSent });
}

/** The raw value next to its date: a wrong type or unit shows at a glance. */
function describeTime(value: unknown): string {
  const date = new Date(value as number);
  const readable = Number.isNaN(date.getTime())
    ? "invalid"
    : date.toISOString();
  return `${String(value)} (${typeof value}, ${readable})`;
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

/**
 * One traffic light, from the tab. Open to every level like runCloseOne. The conversation
 * is read only to show its last comment: someone may be talking with the reporter.
 */
export function runCloseTrafficLight(
  sdk: WmeSDK,
  id: number,
  prompts: Prompts = {},
): Promise<CloseOutcome | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  return withCloseLock(async () => {
    const urs = sdk.DataModel.MapUpdateRequests;
    if (!urs.getById({ mapUpdateRequestId: id })) return null;

    let comments: ConversationElement[] = [];
    try {
      comments =
        (await urs.getUpdateRequestDetails({ mapUpdateRequestId: id }))
          ?.comments ?? [];
    } catch (err) {
      // Nothing is sent, so an unread conversation only costs the excerpt in the dialog.
      log.warn(`Could not read the conversation of UR ${id}`, err);
    }

    const last = comments[comments.length - 1];
    const accepted = await confirm(
      closeTrafficLightSpec(id, last ? last.text : null),
    );
    if (!accepted) return null;

    const outcome = await closeTrafficLight(sdk, id);
    if (outcome.result !== "closed")
      await notify(summarize([outcome], { messagesSent: false }));
    return outcome;
  });
}

/** One abandoned UR, from the tab. Open to every level, like the other single closures. */
export function runCloseStale(
  sdk: WmeSDK,
  id: number,
  prompts: Prompts = {},
  now = Date.now(),
): Promise<CloseOutcome | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  return withCloseLock(async () => {
    const urs = sdk.DataModel.MapUpdateRequests;
    const ur = urs.getById({ mapUpdateRequestId: id });
    if (!ur) return null;

    // Read only to show how long nothing has happened; closeStale reads it again.
    let comments: ConversationElement[] = [];
    try {
      comments =
        (await urs.getUpdateRequestDetails({ mapUpdateRequestId: id }))
          ?.comments ?? [];
    } catch (err) {
      log.warn(`Could not read the conversation of UR ${id}`, err);
    }
    const idleDays = ageInDays(lastActivity(ur.reportedOn, comments), now);
    const accepted = await confirm(closeStaleSpec(id, idleDays));
    if (!accepted) return null;

    const outcome = await closeStale(sdk, id, now);
    if (outcome.result !== "closed")
      await notify(summarize([outcome], { messagesSent: false }));
    return outcome;
  });
}

/**
 * One Map Mate report, from the tab. Open to every level. The conversation is not read
 * first: a report with comments is not listed, and askMapMate checks again after the
 * confirmation, so a comment arriving while the dialog is open still stops the send.
 */
export function runAskMapMate(
  sdk: WmeSDK,
  id: number,
  prompts: Prompts = {},
): Promise<CloseOutcome | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  return withCloseLock(async () => {
    const ur = sdk.DataModel.MapUpdateRequests.getById({
      mapUpdateRequestId: id,
    });
    const kind = ur ? mapMateKind(ur) : null;
    if (!ur || !kind) return null;

    const lang = messageLanguage(ur.userPreferences?.language);
    const accepted = await confirm(askMapMateSpec(id, kind, lang));
    if (!accepted) return null;

    const outcome = await askMapMate(sdk, id);
    if (outcome.result !== "asked") await notify(summarize([outcome]));
    return outcome;
  });
}

/**
 * Everything the editor ticked, at once. Each family is filtered by its own rank before
 * anything is asked, and closeMany checks again. When nothing is left, the editor is told
 * which level the request needed.
 */
export async function runCloseSelected(
  sdk: WmeSDK,
  request: BatchRequest,
  prompts: Prompts = {},
  now = Date.now(),
): Promise<CloseOutcome[] | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  const allowed = allowedBatch(sdk, request);
  if (batchSize(request) > 0 && batchSize(allowed) === 0) {
    const level3Asked = request.speedCamera.length + request.mapMate.length > 0;
    const minRank = level3Asked ? BATCH_MIN_RANK : STALE_BATCH_MIN_RANK;
    await notify(t("errBatchRank", { level: minRank + 1 }));
    return null;
  }
  const batch = capBatch(allowed);
  if (batchSize(batch) === 0) return [];
  // Each closure checks again, but asking the editor to confirm a batch that can only
  // fail is a worse experience than saying so up front.
  if (!sdk.Editing.isEditingAllowed()) {
    await notify(t("errNotAllowedBatch"));
    return null;
  }

  return withCloseLock(async () => {
    const urs = sdk.DataModel.MapUpdateRequests;
    const langOf = (id: number) =>
      messageLanguage(
        urs.getById({ mapUpdateRequestId: id })?.userPreferences?.language,
      );
    const mapMate = batch.mapMate.flatMap((id) => {
      const ur = urs.getById({ mapUpdateRequestId: id });
      const kind = ur ? mapMateKind(ur) : null;
      return kind ? [{ kind, lang: langOf(id) }] : [];
    });
    const accepted = await confirm(
      closeSelectedSpec(
        batch.speedCamera.map(langOf),
        mapMate,
        batch.stale.length,
        getLocale(),
      ),
    );
    if (!accepted) return null;

    const outcomes = await closeMany(sdk, batch, now);
    if (outcomes) await notify(summarizeBatch(outcomes, batch.speedCamera));
    return outcomes;
  });
}
