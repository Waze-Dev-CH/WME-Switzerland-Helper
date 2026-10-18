import type { ConversationElement } from "wme-sdk-typings";
import {
  isAbandoned,
  isReporter,
  lastActivity,
  latestPersonComment,
} from "./detect";
import { isStaleClosing, isStaleReminder } from "./message";

/**
 * How long the reporter gets after our reminder. The reminder itself says "very soon" and
 * names no delay, so this count is the script's alone.
 */
export const REMINDER_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where an abandoned UR stands. "remind" and "close" are the two steps the editor acts on;
 * "waiting" is the grace period after the reminder, with nothing to do.
 */
export type StaleStage =
  | { stage: "none" }
  | { stage: "remind"; lastActivity: number }
  | { stage: "waiting"; remindedOn: number }
  | { stage: "close"; remindedOn: number | null; closingSent: boolean };

/**
 * What this session sent, which WME's cached conversation may not show yet: without it a
 * UR reminded a minute ago would be offered a second reminder at the next scan.
 */
export interface StaleSession {
  remindedOn: number | null;
  closingSent: boolean;
}

const NONE: StaleStage = { stage: "none" };

/**
 * The verdict, in this order: the reporter answered, the closing already left, the
 * reminder is waiting or due, or nothing yet and the UR is idle long enough to remind.
 *
 * Our own texts are never the reporter's: a comment can come back without its author, and
 * a nameless comment otherwise reads as the reporter, which would drop the UR silently.
 */
export function staleStage(
  comments: readonly ConversationElement[],
  reportedOn: number,
  now: number,
  session: StaleSession,
): StaleStage {
  const latest = latestPersonComment(comments);
  const ours =
    latest !== null &&
    (isStaleReminder(latest.text) || isStaleClosing(latest.text));
  if (latest !== null && !ours && isReporter(latest)) return NONE;

  const remindedOn = reminderDate(latest, session.remindedOn);
  // Anywhere in the conversation: a closing message must never leave twice.
  const closingSent =
    session.closingSent ||
    comments.some((comment) => isStaleClosing(comment.text));
  if (closingSent) return { stage: "close", remindedOn, closingSent: true };

  if (remindedOn !== null) {
    const due = now - remindedOn >= REMINDER_GRACE_DAYS * DAY_MS;
    if (!due) return { stage: "waiting", remindedOn };
    return { stage: "close", remindedOn, closingSent: false };
  }

  if (!isAbandoned(comments, reportedOn, now)) return NONE;
  return { stage: "remind", lastActivity: lastActivity(reportedOn, comments) };
}

/**
 * The reminder counts only while it is the last word among the people: an editor writing
 * after it starts a new conversation, and the UR goes through the 14 days again. The
 * session's date stands in only when no later comment is known.
 */
function reminderDate(
  latest: ConversationElement | null,
  sessionRemindedOn: number | null,
): number | null {
  if (latest !== null && isStaleReminder(latest.text)) return latest.createdOn;
  if (sessionRemindedOn === null) return null;
  const laterComment = latest !== null && latest.createdOn > sessionRemindedOn;
  return laterComment ? null : sessionRemindedOn;
}

/** Whole days left before the closure is due, never below zero. */
export function graceDaysLeft(remindedOn: number, now: number): number {
  const left = remindedOn + REMINDER_GRACE_DAYS * DAY_MS - now;
  return Math.max(0, Math.ceil(left / DAY_MS));
}
