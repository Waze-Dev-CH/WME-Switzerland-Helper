import { describe, expect, it } from "vitest";
import {
  getStreetNameVerdict,
  registerStreetNameProvider,
  resetStreetNameProvider,
} from "../street-check-bridge";
import type { Issue, IssueStatus } from "./matching/evaluate";
import { createStreetNameProvider } from "./name-verdict";
import type { ScanSnapshot } from "./scan";

const SEGMENT_ID = 123456;

function issue(status: IssueStatus, suggestion: string | null = null): Issue {
  return {
    segmentId: SEGMENT_ID,
    status,
    currentName: "Rue Exemple",
    suggestion,
    note: null,
    cityId: null,
    cityName: null,
    cantonName: null,
    roadType: 1,
    length: 100,
    geometry: { type: "LineString", coordinates: [] },
    fixable: true,
  } as Issue;
}

function snapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    state: "done",
    issues: new Map(),
    nameConformIds: new Set(),
    stats: { ok: 0, okAlt: 0, skipped: 0, total: 0 },
    officialStreetCount: 0,
    progress: null,
    sweep: null,
    sweepEligible: false,
    truncatedTileCount: 0,
    failedTileCount: 0,
    continuationLookupsExhausted: false,
    error: null,
    unsavedCount: 0,
    ...overrides,
  } as ScanSnapshot;
}

function providerFor(snap: ScanSnapshot) {
  return createStreetNameProvider({ getSnapshot: () => snap });
}

/** A segment the name pass actually compared with the register and accepted. */
const checked = new Set([SEGMENT_ID]);

describe("createStreetNameProvider", () => {
  it("says conform for a segment the name pass cleared", () => {
    expect(providerFor(snapshot({ nameConformIds: checked }))(SEGMENT_ID)).toEqual({
      kind: "conform",
    });
  });

  it("says mismatch and carries the official suggestion", () => {
    const issues = new Map([[SEGMENT_ID, issue("NOT_FOUND", "Route de Berne")]]);
    expect(providerFor(snapshot({ issues }))(SEGMENT_ID)).toEqual({
      kind: "mismatch",
      status: "NOT_FOUND",
      suggestion: "Route de Berne",
    });
  });

  it.each<IssueStatus>(["UNDER_LOCK", "OVER_LOCK", "MICRO_SEGMENT", "LOOP", "NARROW_MISUSE"])(
    "says conform for %s, which is not about the name",
    (status) => {
      // These come from the guideline checks (lock rank, geometry) and share the issues
      // map. Reading them as a naming problem would flag perfectly named streets, and the
      // name pass did clear this one.
      const issues = new Map([[SEGMENT_ID, issue(status)]]);
      expect(providerFor(snapshot({ issues, nameConformIds: checked }))(SEGMENT_ID)).toEqual({
        kind: "conform",
      });
    },
  );

  it.each(["idle", "fetching", "evaluating", "paused", "disabled", "error", "zoom-gated"] as const)(
    "says unknown while the state is %s",
    (state) => {
      // Outside "done" the issues map may hold the previous run's results, and an absence
      // proves nothing at all.
      expect(providerFor(snapshot({ state, nameConformIds: checked }))(SEGMENT_ID)).toEqual({
        kind: "unknown",
      });
    },
  );

  it("says unknown when neither an issue nor a name check covered the segment", () => {
    // The whole point: outside the fetched area, road type not checked, status switched
    // off, finding dismissed as a false positive. Nothing was verified, nothing is vouched
    // for. Reading the absence of an issue as "conform" is what used to happen here.
    expect(providerFor(snapshot())(SEGMENT_ID)).toEqual({ kind: "unknown" });
  });

  it("says unknown for a lock finding on a segment the name pass never covered", () => {
    const issues = new Map([[SEGMENT_ID, issue("OVER_LOCK")]]);
    expect(providerFor(snapshot({ issues }))(SEGMENT_ID)).toEqual({
      kind: "unknown",
    });
  });
});

describe("the bridge", () => {
  it("answers unknown when the checker never registered", () => {
    // The importer must behave when the checker is off, still starting, or not built in.
    resetStreetNameProvider();
    expect(getStreetNameVerdict(SEGMENT_ID)).toEqual({ kind: "unknown" });
  });

  it("answers unknown rather than propagating a provider failure", () => {
    registerStreetNameProvider(() => {
      throw new Error("boom");
    });
    expect(getStreetNameVerdict(SEGMENT_ID)).toEqual({ kind: "unknown" });
    resetStreetNameProvider();
  });

  it("relays what the provider says", () => {
    registerStreetNameProvider(() => ({ kind: "conform" }));
    expect(getStreetNameVerdict(SEGMENT_ID)).toEqual({ kind: "conform" });
    resetStreetNameProvider();
  });
});
