import { describe, expect, it } from "vitest";
import { BATCH_CAP } from "../close";
import type { MapMateEntry, ScanSnapshot, UrEntry } from "../scanner";
import { DEFAULT_CRITERIA } from "../settings";
import {
  formatCloseSelectedButton,
  formatMapMateRowLabel,
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
  const snapshot = (over: Partial<ScanSnapshot> = {}): ScanSnapshot => ({
    entries: [],
    trafficLights: [],
    mapMate: [],
    stale: [],
    ...over,
  });
  const report = (id: number, state: MapMateEntry["state"]): MapMateEntry => ({
    ...entry(id, "ready"),
    kind: "route",
    state,
  });

  it("says when nothing is on screen, and why that may be", () => {
    expect(formatStatus(snapshot(), DEFAULT_CRITERIA)).toContain(
      "must be shown on the map",
    );
  });

  it("asks to tick a family when none is", () => {
    const none = {
      speedCamera: false,
      trafficLight: false,
      mapMate: false,
      stale: false,
    };
    expect(formatStatus(snapshot(), none)).toBe(
      "No family ticked: tick at least one below.",
    );
  });

  it("counts every ticked family, and the URs still being checked", () => {
    const criteria = { ...DEFAULT_CRITERIA, mapMate: true };
    const status = formatStatus(
      snapshot({
        entries: [entry(1, "ready")],
        mapMate: [report(2, "pending"), report(3, "ready")],
      }),
      criteria,
    );
    expect(status).toBe("3 UR(s) to handle on screen, checking 1");
  });

  it("leaves out the families that are not ticked", () => {
    const status = formatStatus(
      snapshot({ entries: [entry(1, "ready")], mapMate: [report(2, "ready")] }),
      DEFAULT_CRITERIA,
    );
    expect(status).toBe("1 UR(s) to handle on screen");
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
  const ready = { speedCamera: [1, 2], mapMate: [5], stale: [10] };
  const everyone = { speedCamera: true, mapMate: true, stale: true };

  it("takes the speed cameras by default, not Map Mate nor the abandoned URs", () => {
    expect(selectedBatch(DEFAULT_CRITERIA, everyone, ready)).toEqual({
      speedCamera: [1, 2],
      mapMate: [],
      stale: [],
    });
  });

  it("takes every family that is checked and allowed", () => {
    const criteria = { ...DEFAULT_CRITERIA, mapMate: true, stale: true };
    expect(selectedBatch(criteria, everyone, ready)).toEqual(ready);
  });

  it("drops a family that is unchecked", () => {
    const criteria = {
      speedCamera: false,
      trafficLight: true,
      stale: true,
      mapMate: false,
    };
    expect(selectedBatch(criteria, everyone, ready)).toEqual({
      speedCamera: [],
      mapMate: [],
      stale: [10],
    });
  });

  it("drops the abandoned URs at level 3 and everything below it", () => {
    const criteria = { ...DEFAULT_CRITERIA, mapMate: true, stale: true };
    expect(
      selectedBatch(
        criteria,
        { speedCamera: true, mapMate: true, stale: false },
        ready,
      ),
    ).toEqual({ speedCamera: [1, 2], mapMate: [5], stale: [] });
    expect(
      selectedBatch(
        criteria,
        { speedCamera: false, mapMate: false, stale: false },
        ready,
      ),
    ).toEqual({ speedCamera: [], mapMate: [], stale: [] });
  });
});

describe("formatCloseSelectedButton", () => {
  it("names the count, and the cap when there are more", () => {
    expect(formatCloseSelectedButton(12)).toBe("Handle the 12 selected UR(s)");
    expect(formatCloseSelectedButton(BATCH_CAP + 5)).toBe(
      `Handle ${BATCH_CAP} of the ${BATCH_CAP + 5} selected UR(s)`,
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

describe("formatMapMateRowLabel", () => {
  it("names the case after the id", () => {
    const label = formatMapMateRowLabel(
      { ...entry(9, "ready"), kind: "speedLimit", state: "ready" },
      "en",
    );
    expect(label).toMatch(/^#9 · Speed limit · DE · /);
  });
});
