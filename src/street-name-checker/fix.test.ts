import type { LineString } from "geojson";
import type { WmeSDK } from "wme-sdk-typings";
import { describe, expect, it } from "vitest";
import { fixGroup, fixSegment, withFixLock } from "./fix";
import type { Issue } from "./matching/evaluate";
import { DEFAULT_SETTINGS } from "./settings";

const GEOMETRY: LineString = {
  type: "LineString",
  coordinates: [
    [6.63, 46.52],
    [6.64, 46.52],
  ],
};

let nextId = 1;

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    segmentId: nextId++,
    status: "VARIANT",
    currentName: "Av. de Florimont",
    suggestion: "Avenue de Florimont",
    note: null,
    cityId: 10,
    cityName: "Lausanne",
    cantonName: "Vaud",
    roadType: 1,
    length: 100,
    geometry: GEOMETRY,
    fixable: true,
    ...overrides,
  };
}

interface LockUpdate {
  segmentId: number;
  lockRank: number;
}

/**
 * Minimal SDK stub where every street fix succeeds. `lockRank` is the segment's
 * current 0-based lock; `userRank` is the editor's 0-based rank (default high so
 * lock fixes are never blocked by the rank ceiling).
 */
function makeSdk(
  lockRank = 0,
  userRank = 5,
): {
  sdk: WmeSDK;
  updates: number[];
  lockUpdates: LockUpdate[];
} {
  const updates: number[] = [];
  const lockUpdates: LockUpdate[] = [];
  const sdk = {
    Editing: { isEditingAllowed: () => true },
    State: { getUserInfo: () => ({ rank: userRank }) },
    DataModel: {
      Segments: {
        getById: ({ segmentId }: { segmentId: number }) => ({
          id: segmentId,
          primaryStreetId: 100,
          alternateStreetIds: [],
          lockRank,
        }),
        getAddress: () => ({ city: { id: 10, name: "Lausanne" } }),
        updateAddress: ({ segmentId }: { segmentId: number }) => {
          updates.push(segmentId);
        },
        updateSegment: (args: { segmentId: number; lockRank: number }) => {
          lockUpdates.push({ segmentId: args.segmentId, lockRank: args.lockRank });
        },
      },
      Streets: {
        getStreet: () => ({ id: 200, name: "Avenue de Florimont" }),
        addStreet: () => ({ id: 200, name: "Avenue de Florimont" }),
      },
    },
  } as unknown as WmeSDK;
  return { sdk, updates, lockUpdates };
}

describe("fixSegment", () => {
  it("applies the suggestion", () => {
    const { sdk, updates } = makeSdk();
    const i = issue();
    const outcome = fixSegment(sdk, i, DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(true);
    expect(updates).toEqual([i.segmentId]);
  });

  it("does nothing when the street is already assigned (no empty edit)", () => {
    const { sdk, updates } = makeSdk();
    // makeSdk assigns primaryStreetId 100; force getStreet to return that same street
    (sdk.DataModel.Streets as { getStreet: unknown }).getStreet = () => ({ id: 100 });
    const outcome = fixSegment(sdk, issue(), DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("refuses non-fixable issues", () => {
    const { sdk } = makeSdk();
    const outcome = fixSegment(sdk, issue({ fixable: false, suggestion: null }), DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(false);
    expect(outcome.errorCode).toBe("errNotFixable");
  });

  // SDK stub that assigns a distinct street id per name (in request order, from 200) and
  // records the address passed to updateAddress, so BILINGUAL handling can be asserted.
  function makeNamedSdk(primaryStreetId = 100): {
    sdk: WmeSDK;
    update: () => { primaryStreetId: number; alternateStreetIds: number[] } | null;
  } {
    const ids = new Map<string, number>();
    let nextStreetId = 200;
    const idFor = (name: string) => {
      let id = ids.get(name);
      if (id === undefined) {
        id = nextStreetId++;
        ids.set(name, id);
      }
      return id;
    };
    let captured: { primaryStreetId: number; alternateStreetIds: number[] } | null = null;
    const sdk = {
      Editing: { isEditingAllowed: () => true },
      State: { getUserInfo: () => ({ rank: 5 }) },
      DataModel: {
        Segments: {
          getById: ({ segmentId }: { segmentId: number }) => ({
            id: segmentId,
            primaryStreetId,
            alternateStreetIds: [],
            lockRank: 0,
          }),
          getAddress: () => ({ city: { id: 10, name: "Biel/Bienne" } }),
          updateAddress: (args: { primaryStreetId: number; alternateStreetIds: number[] }) => {
            captured = { primaryStreetId: args.primaryStreetId, alternateStreetIds: args.alternateStreetIds };
          },
        },
        Streets: {
          getStreet: ({ streetName }: { streetName: string }) => ({
            id: idFor(streetName),
            name: streetName,
          }),
          addStreet: ({ streetName }: { streetName: string }) => ({
            id: idFor(streetName),
            name: streetName,
          }),
        },
      },
    } as unknown as WmeSDK;
    return { sdk, update: () => captured };
  }

  it("splits a slash-in-primary bilingual name: primary = first part, other as alternate", () => {
    const { sdk, update } = makeNamedSdk();
    const bilingual = issue({
      status: "BILINGUAL",
      currentName: "Unterer Quai / Quai du Bas",
      suggestion: "Unterer Quai",
      note: { fullLabel: "Unterer Quai / Quai du Bas", altLabels: ["Quai du Bas"] },
    });
    const outcome = fixSegment(sdk, bilingual, DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(true);
    // First requested name "Unterer Quai" -> 200 (primary), "Quai du Bas" -> 201 (alternate).
    expect(update()).toEqual({ primaryStreetId: 200, alternateStreetIds: [201] });
  });

  it("adds a missing alternate while keeping the chosen primary language", () => {
    // The primary street ("Quai du Bas" -> 200) is already correct; only the alternate is added.
    const { sdk, update } = makeNamedSdk(200);
    const bilingual = issue({
      status: "BILINGUAL",
      currentName: "Quai du Bas",
      suggestion: "Quai du Bas",
      note: { fullLabel: "Unterer Quai / Quai du Bas", altLabels: ["Unterer Quai"] },
    });
    const outcome = fixSegment(sdk, bilingual, DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(true);
    expect(update()).toEqual({ primaryStreetId: 200, alternateStreetIds: [201] });
  });
});

describe("fixSegment (lock)", () => {
  // note.expectedLock is a 1-6 level; the fix writes lockRank = level - 1.
  const lockIssue = (status: Issue["status"], expectedLevel: number): Issue =>
    issue({ status, suggestion: null, note: { currentLock: 1, expectedLock: expectedLevel } });

  it("raises an under-locked segment to the expected level (level - 1 lockRank)", () => {
    const { sdk, lockUpdates } = makeSdk(0);
    const outcome = fixSegment(sdk, lockIssue("UNDER_LOCK", 3), DEFAULT_SETTINGS); // L3 -> lockRank 2
    expect(outcome.ok).toBe(true);
    expect(lockUpdates).toEqual([{ segmentId: expect.any(Number), lockRank: 2 }]);
  });

  it("lowers an over-locked segment to the expected level", () => {
    const { sdk, lockUpdates } = makeSdk(4);
    const outcome = fixSegment(sdk, lockIssue("OVER_LOCK", 2), DEFAULT_SETTINGS); // L2 -> lockRank 1
    expect(outcome.ok).toBe(true);
    expect(lockUpdates).toEqual([{ segmentId: expect.any(Number), lockRank: 1 }]);
  });

  it("does nothing when the lock is already at the expected level (no empty edit)", () => {
    const { sdk, lockUpdates } = makeSdk(2); // already lockRank 2 = level 3
    const outcome = fixSegment(sdk, lockIssue("UNDER_LOCK", 3), DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(true);
    expect(lockUpdates).toHaveLength(0);
  });

  it("refuses when the note carries no expected level", () => {
    const { sdk } = makeSdk();
    const outcome = fixSegment(sdk, issue({ status: "UNDER_LOCK", suggestion: null, note: null }), DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(false);
    expect(outcome.errorCode).toBe("errNotFixable");
  });

  it("reports editing-not-allowed without touching the segment", () => {
    const { sdk, lockUpdates } = makeSdk(0);
    (sdk.Editing as { isEditingAllowed: unknown }).isEditingAllowed = () => false;
    const outcome = fixSegment(sdk, lockIssue("UNDER_LOCK", 3), DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(false);
    expect(outcome.errorCode).toBe("errEditingNotAllowed");
    expect(lockUpdates).toHaveLength(0);
  });

  it("rejects a target level above the editor level with a level-based message", () => {
    const { sdk, lockUpdates } = makeSdk(0, 2); // editor rank 2 = level 3
    const outcome = fixSegment(sdk, lockIssue("UNDER_LOCK", 4), DEFAULT_SETTINGS); // wants L4 > L3
    expect(outcome.ok).toBe(false);
    expect(outcome.errorDetail).toContain("L4");
    expect(outcome.errorDetail).toContain("L3");
    expect(lockUpdates).toHaveLength(0);
  });

  it("surfaces an unexpected SDK rejection as errorDetail", () => {
    const { sdk } = makeSdk(0);
    (sdk.DataModel.Segments as { updateSegment: unknown }).updateSegment = () => {
      throw new Error("boom");
    };
    const outcome = fixSegment(sdk, lockIssue("UNDER_LOCK", 5), DEFAULT_SETTINGS);
    expect(outcome.ok).toBe(false);
    expect(outcome.errorCode).toBeUndefined();
    expect(outcome.errorDetail).toBe("boom");
  });
});

describe("fixGroup", () => {
  it("reports progress for each segment and yields between them", async () => {
    const { sdk, updates } = makeSdk();
    const issues = [issue(), issue(), issue()];
    const progress: Array<[number, number]> = [];
    const outcomes = await fixGroup(sdk, issues, DEFAULT_SETTINGS, (done, total) =>
      progress.push([done, total]),
    );
    expect(outcomes).toHaveLength(3);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(updates).toHaveLength(3);
  });

  it("stops at the first error", async () => {
    const { sdk } = makeSdk();
    const issues = [issue(), issue({ fixable: false, suggestion: null }), issue()];
    const outcomes = await fixGroup(sdk, issues, DEFAULT_SETTINGS);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[1]?.ok).toBe(false);
  });
});

describe("withFixLock", () => {
  it("rejects re-entrance while a fix is running", async () => {
    let release!: () => void;
    const first = withFixLock(
      () => new Promise<string>((resolve) => (release = () => resolve("first"))),
    );
    const second = await withFixLock(async () => "second");
    expect(second).toBeNull();
    release();
    expect(await first).toBe("first");
    // lock released: next call goes through
    expect(await withFixLock(async () => "third")).toBe("third");
  });
});
