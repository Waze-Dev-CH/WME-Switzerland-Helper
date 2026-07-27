import { describe, expect, it } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import {
  getStreetNameVerdict,
  registerStreetNameProvider,
  resetStreetNameProvider,
} from "../street-check-bridge";
import type { Issue, IssueStatus } from "./matching/evaluate";
import { createStreetNameProvider } from "./name-verdict";
import type { ScanSnapshot } from "./scan";
import type { SettingsStore } from "./settings";

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

function makeContext(options: {
  snapshot: ScanSnapshot;
  roadType?: number;
  streetName?: string | null;
  segmentExists?: boolean;
}) {
  const sdk = {
    DataModel: {
      Segments: {
        getById: () =>
          options.segmentExists === false
            ? null
            : { id: SEGMENT_ID, roadType: options.roadType ?? 1 },
        getAddress: () => ({
          street:
            options.streetName === null ? null : { name: options.streetName ?? "Rue Exemple" },
          altStreets: [],
        }),
      },
    },
  } as unknown as WmeSDK;
  const settings = { get: () => ({ checkedRoadTypes: [1, 2, 6, 7] }) } as unknown as SettingsStore;
  return { sdk, settings, getSnapshot: () => options.snapshot };
}

describe("createStreetNameProvider", () => {
  it("says conform for a checked, named segment with no issue", () => {
    const provider = createStreetNameProvider(makeContext({ snapshot: snapshot() }));
    expect(provider(SEGMENT_ID)).toEqual({ kind: "conform" });
  });

  it("says mismatch and carries the official suggestion", () => {
    const issues = new Map([[SEGMENT_ID, issue("NOT_FOUND", "Route de Berne")]]);
    const provider = createStreetNameProvider(makeContext({ snapshot: snapshot({ issues }) }));
    expect(provider(SEGMENT_ID)).toEqual({
      kind: "mismatch",
      status: "NOT_FOUND",
      suggestion: "Route de Berne",
    });
  });

  it.each<IssueStatus>(["UNDER_LOCK", "OVER_LOCK", "MICRO_SEGMENT", "LOOP", "NARROW_MISUSE"])(
    "says conform for %s, which is not about the name",
    (status) => {
      // These come from the guideline checks (lock rank, geometry) and share the issues
      // map. Reading them as a naming problem would flag perfectly named streets.
      const issues = new Map([[SEGMENT_ID, issue(status)]]);
      const provider = createStreetNameProvider(makeContext({ snapshot: snapshot({ issues }) }));
      expect(provider(SEGMENT_ID)).toEqual({ kind: "conform" });
    },
  );

  it.each(["idle", "fetching", "evaluating", "paused", "disabled", "error", "zoom-gated"] as const)(
    "says unknown while the state is %s",
    (state) => {
      // Outside "done" the issues map may hold the previous run's results, and an absence
      // proves nothing at all.
      const provider = createStreetNameProvider(makeContext({ snapshot: snapshot({ state }) }));
      expect(provider(SEGMENT_ID)).toEqual({ kind: "unknown" });
    },
  );

  it("says unknown for a road type the checker does not look at", () => {
    const provider = createStreetNameProvider(makeContext({ snapshot: snapshot(), roadType: 20 }));
    expect(provider(SEGMENT_ID)).toEqual({ kind: "unknown" });
  });

  it("says unknown for an unnamed segment", () => {
    const provider = createStreetNameProvider(
      makeContext({ snapshot: snapshot(), streetName: null }),
    );
    expect(provider(SEGMENT_ID)).toEqual({ kind: "unknown" });
  });

  it("says unknown for a segment that is no longer loaded", () => {
    const provider = createStreetNameProvider(
      makeContext({ snapshot: snapshot(), segmentExists: false }),
    );
    expect(provider(SEGMENT_ID)).toEqual({ kind: "unknown" });
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
