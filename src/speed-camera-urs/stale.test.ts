import { beforeEach, describe, expect, it } from "vitest";
import { resetMessagedForTests } from "./close";
import { buildStaleClosing, buildStaleReminder } from "./message";
import { graceDaysLeft, staleStage, type StaleSession } from "./stale";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const REPORTED = NOW - 40 * DAY;
const nothingSent: StaleSession = { remindedOn: null, closingSent: false };

const at = (daysAgo: number, userName: string | null, text = "hello?") => ({
  createdOn: NOW - daysAgo * DAY,
  text,
  userName,
});
const reminderAt = (daysAgo: number, userName: string | null = "editor") =>
  at(daysAgo, userName, buildStaleReminder("it"));
const closingAt = (daysAgo: number) =>
  at(daysAgo, "editor", buildStaleClosing("en"));

beforeEach(() => resetMessagedForTests());

describe("staleStage", () => {
  it("asks for a reminder once nothing happened for 14 days", () => {
    expect(staleStage([], REPORTED, NOW, nothingSent)).toEqual({
      stage: "remind",
      lastActivity: REPORTED,
    });
    expect(
      staleStage([at(20, "Map_Team")], REPORTED, NOW, nothingSent),
    ).toEqual({ stage: "remind", lastActivity: NOW - 20 * DAY });
  });

  it("is none while the UR is younger than 14 days idle, or the reporter spoke last", () => {
    expect(staleStage([at(10, "editor")], REPORTED, NOW, nothingSent)).toEqual({
      stage: "none",
    });
    expect(
      staleStage([at(30, "editor"), at(20, null)], REPORTED, NOW, nothingSent),
    ).toEqual({ stage: "none" });
  });

  it("waits three days after the reminder, then the closure is due", () => {
    expect(staleStage([reminderAt(2)], REPORTED, NOW, nothingSent)).toEqual({
      stage: "waiting",
      remindedOn: NOW - 2 * DAY,
    });
    expect(staleStage([reminderAt(3)], REPORTED, NOW, nothingSent)).toEqual({
      stage: "close",
      remindedOn: NOW - 3 * DAY,
      closingSent: false,
    });
  });

  it("ignores Map_Team's automatic comments after the reminder", () => {
    const comments = [reminderAt(5), at(4, "Map_Team")];
    expect(staleStage(comments, REPORTED, NOW, nothingSent).stage).toBe(
      "close",
    );
  });

  it("drops the UR when the reporter answers the reminder", () => {
    const comments = [reminderAt(5), at(1, null, "it is still wrong")];
    expect(staleStage(comments, REPORTED, NOW, nothingSent)).toEqual({
      stage: "none",
    });
    const admin = [reminderAt(5), at(1, "admin", "yes")];
    expect(staleStage(admin, REPORTED, NOW, nothingSent)).toEqual({
      stage: "none",
    });
  });

  it("starts over when an editor writes after the reminder", () => {
    const fresh = [reminderAt(10), at(5, "editor")];
    expect(staleStage(fresh, REPORTED, NOW, nothingSent)).toEqual({
      stage: "none",
    });
    const old = [reminderAt(30), at(20, "editor")];
    expect(staleStage(old, REPORTED, NOW, nothingSent).stage).toBe("remind");
  });

  it("never takes our own reminder for the reporter when WME drops its author", () => {
    expect(
      staleStage([reminderAt(4, null)], REPORTED, NOW, nothingSent).stage,
    ).toBe("close");
  });

  it("counts from this session's reminder when WME's conversation does not show it yet", () => {
    const session = { remindedOn: NOW - DAY, closingSent: false };
    expect(staleStage([at(20, "Map_Team")], REPORTED, NOW, session)).toEqual({
      stage: "waiting",
      remindedOn: NOW - DAY,
    });
  });

  it("lets a later comment override this session's reminder", () => {
    const session = { remindedOn: NOW - 2 * DAY, closingSent: false };
    expect(
      staleStage([at(1, null, "still there")], REPORTED, NOW, session),
    ).toEqual({ stage: "none" });
  });

  it("knows the closing message left, from the conversation or the session", () => {
    expect(
      staleStage([reminderAt(5), closingAt(1)], REPORTED, NOW, nothingSent),
    ).toEqual({ stage: "close", remindedOn: null, closingSent: true });
    expect(
      staleStage([reminderAt(5)], REPORTED, NOW, {
        remindedOn: null,
        closingSent: true,
      }),
    ).toEqual({ stage: "close", remindedOn: NOW - 5 * DAY, closingSent: true });
  });

  it("still drops the UR when the reporter writes after the closing message", () => {
    const comments = [reminderAt(5), closingAt(2), at(1, null, "why?")];
    expect(staleStage(comments, REPORTED, NOW, nothingSent)).toEqual({
      stage: "none",
    });
  });
});

describe("graceDaysLeft", () => {
  it("rounds up, and never goes below zero", () => {
    expect(graceDaysLeft(NOW, NOW)).toBe(3);
    expect(graceDaysLeft(NOW - DAY - 1, NOW)).toBe(2);
    expect(graceDaysLeft(NOW - 3 * DAY, NOW)).toBe(0);
    expect(graceDaysLeft(NOW - 10 * DAY, NOW)).toBe(0);
  });
});
