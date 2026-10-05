import { describe, expect, it } from "vitest";
import { BATCH_CAP } from "../close";
import type { UrEntry } from "../scanner";
import {
  formatCloseAllButton,
  formatRowLabel,
  formatStatus,
  shouldShowCloseAll,
  splitEntries,
} from "./format";

const entry = (id: number, triage: UrEntry["triage"]): UrEntry => ({
  id,
  lon: 6.6,
  lat: 46.5,
  reportedOn: Date.UTC(2026, 9, 1),
  lang: "de",
  triage,
});

describe("splitEntries", () => {
  it("sorts entries into the three groups, keeping their order", () => {
    const lists = splitEntries([
      entry(1, "ready"),
      entry(2, "pending"),
      entry(3, "conversation"),
      entry(4, "ready"),
    ]);
    expect(lists.ready.map((e) => e.id)).toEqual([1, 4]);
    expect(lists.pending.map((e) => e.id)).toEqual([2]);
    expect(lists.conversation.map((e) => e.id)).toEqual([3]);
  });
});

describe("formatStatus", () => {
  it("says when nothing is on screen, and why that may be", () => {
    expect(formatStatus([])).toContain("must be shown on the map");
  });

  it("counts the URs and the ones still being checked", () => {
    expect(formatStatus([entry(1, "ready"), entry(2, "pending")])).toBe(
      "2 speed-camera UR(s) on screen, checking 1",
    );
    expect(formatStatus([entry(1, "ready")])).toBe(
      "1 speed-camera UR(s) on screen",
    );
  });
});

describe("formatRowLabel", () => {
  it("shows the id, the reporter's language and the date", () => {
    const label = formatRowLabel(entry(27011214, "ready"), "fr");
    expect(label).toMatch(/^#27011214 · DE · /);
    expect(label).toContain("2026");
  });
});

describe("formatCloseAllButton", () => {
  it("names the count, and the cap when there are more", () => {
    expect(formatCloseAllButton(12)).toBe("Handle all (12)");
    expect(formatCloseAllButton(BATCH_CAP + 5)).toBe(
      `Handle ${BATCH_CAP} of ${BATCH_CAP + 5}`,
    );
  });
});

describe("shouldShowCloseAll", () => {
  it("hides the batch below the level and when there is nothing to do", () => {
    expect(shouldShowCloseAll(true, 3)).toBe(true);
    expect(shouldShowCloseAll(false, 3)).toBe(false);
    expect(shouldShowCloseAll(true, 0)).toBe(false);
  });
});
