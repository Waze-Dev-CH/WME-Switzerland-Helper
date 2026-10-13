import { describe, expect, it } from "vitest";
import { BATCH_CAP } from "../close";
import type { UrEntry } from "../scanner";
import { DEFAULT_CRITERIA } from "../settings";
import {
  formatCloseSelectedButton,
  formatRowLabel,
  formatStaleRowLabel,
  formatStatus,
  selectedBatch,
  shouldShowCloseSelected,
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

describe("selectedBatch", () => {
  const ready = { speedCamera: [1, 2], stale: [10] };
  const everyone = { speedCamera: true, stale: true };

  it("takes the speed cameras by default, not the abandoned URs", () => {
    expect(selectedBatch(DEFAULT_CRITERIA, everyone, ready)).toEqual({
      speedCamera: [1, 2],
      stale: [],
    });
  });

  it("takes both families when both are checked and allowed", () => {
    const criteria = { ...DEFAULT_CRITERIA, stale: true };
    expect(selectedBatch(criteria, everyone, ready)).toEqual(ready);
  });

  it("drops a family that is unchecked", () => {
    const criteria = { speedCamera: false, trafficLight: true, stale: true };
    expect(selectedBatch(criteria, everyone, ready)).toEqual({
      speedCamera: [],
      stale: [10],
    });
  });

  it("drops the abandoned URs at level 3 and everything below it", () => {
    const criteria = { ...DEFAULT_CRITERIA, stale: true };
    expect(
      selectedBatch(criteria, { speedCamera: true, stale: false }, ready),
    ).toEqual({ speedCamera: [1, 2], stale: [] });
    expect(
      selectedBatch(criteria, { speedCamera: false, stale: false }, ready),
    ).toEqual({ speedCamera: [], stale: [] });
  });
});

describe("formatCloseSelectedButton", () => {
  it("names the count, and the cap when there are more", () => {
    expect(formatCloseSelectedButton(12)).toBe("Close the 12 selected UR(s)");
    expect(formatCloseSelectedButton(BATCH_CAP + 5)).toBe(
      `Close ${BATCH_CAP} of the ${BATCH_CAP + 5} selected UR(s)`,
    );
  });
});

describe("shouldShowCloseSelected", () => {
  it("hides the button when nothing is selected", () => {
    expect(shouldShowCloseSelected(3)).toBe(true);
    expect(shouldShowCloseSelected(0)).toBe(false);
  });
});

describe("formatStaleRowLabel", () => {
  it("adds the age in days to the usual label", () => {
    const now = Date.UTC(2026, 9, 1) + 20 * 24 * 60 * 60 * 1000;
    const label = formatStaleRowLabel(entry(5, "ready"), "en", now);
    expect(label).toMatch(/^#5 · DE · .* · 20 d$/);
  });
});
