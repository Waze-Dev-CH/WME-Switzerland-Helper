import type { LineString } from "geojson";
import type { WmeSDK } from "wme-sdk-typings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixGroup, fixSegment, ignoreIssue, runFix, runFixGroup, withFixLock } from "./fix";
import type { Issue } from "./matching/evaluate";
import { DEFAULT_SETTINGS, type SettingsStore } from "./settings";

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

describe("runFix (shared UI runner)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("applies the fix and calls onComplete", async () => {
    const { sdk, updates } = makeSdk();
    let completed = false;
    await runFix(sdk, issue(), DEFAULT_SETTINGS, { onComplete: () => (completed = true) });
    expect(updates).toHaveLength(1);
    expect(completed).toBe(true);
  });

  it("aborts an OVER_LOCK fix (no edit, no onComplete) when the confirm is declined", async () => {
    const { sdk, lockUpdates } = makeSdk(4);
    let completed = false;
    const overLock = issue({
      status: "OVER_LOCK",
      suggestion: null,
      note: { currentLock: 5, expectedLock: 2 },
    });
    await runFix(sdk, overLock, DEFAULT_SETTINGS, {
      confirm: async () => false,
      onComplete: () => (completed = true),
    });
    expect(lockUpdates).toHaveLength(0);
    expect(completed).toBe(false);
  });
});

describe("group fix rank guard", () => {
  const group = () => [issue(), issue(), issue()];
  const header = { status: "COSMETIC" as const, suggestion: "Avenue de Florimont" };

  it("refuses below editor level 3 and says why", async () => {
    // rank 1 = displayed level 2. The UI hides the button, but two UIs build it and the
    // refusal has to live with the action, not with the button.
    const { sdk, updates } = makeSdk(0, 1);
    const notices: string[] = [];
    await runFixGroup(sdk, group(), header, DEFAULT_SETTINGS, {
      notify: async (m) => void notices.push(m),
    });
    expect(updates).toHaveLength(0);
    expect(notices).toHaveLength(1);
  });

  it("allows it from editor level 3 up", async () => {
    const { sdk, updates } = makeSdk(0, 2);
    await runFixGroup(sdk, group(), header, DEFAULT_SETTINGS, { confirm: async () => true });
    expect(updates).toHaveLength(3);
  });

  it("treats an unknown rank as insufficient", async () => {
    // makeSdk defaults userRank to 5, so passing undefined through it would just restore
    // the default. This case needs a stub whose getUserInfo genuinely returns nothing.
    const updates: number[] = [];
    const sdk = {
      Editing: { isEditingAllowed: () => true },
      State: { getUserInfo: () => undefined },
      DataModel: {
        Segments: {
          getById: ({ segmentId }: { segmentId: number }) => ({ id: segmentId }),
          updateAddress: ({ segmentId }: { segmentId: number }) => void updates.push(segmentId),
        },
      },
    } as unknown as WmeSDK;

    await runFixGroup(sdk, group(), header, DEFAULT_SETTINGS, { notify: async () => undefined });
    expect(updates).toHaveLength(0);
  });
});

describe("geometric verdicts always confirm", () => {
  const wrongStreet = () =>
    issue({
      status: "WRONG_STREET",
      currentName: "Chemin de la Poste",
      suggestion: "Route de la Guerite",
      note: { coverage: 0.8, matchDistanceM: 3, ownDistanceM: 210 },
    });

  it("asks before renaming a single segment", async () => {
    // Until now this was the one destructive fix with no confirmation at all, while
    // lowering a lock, undone with a click, always asked.
    const { sdk, updates } = makeSdk();
    let asked = "";
    await runFix(sdk, wrongStreet(), DEFAULT_SETTINGS, {
      confirm: async (message) => {
        asked = message;
        return false;
      },
    });
    expect(updates).toHaveLength(0);
    expect(asked).toContain("Chemin de la Poste");
    expect(asked).toContain("Route de la Guerite");
  });

  it("carries the match confidence into the prompt", async () => {
    const { sdk } = makeSdk();
    let asked = "";
    await runFix(sdk, wrongStreet(), DEFAULT_SETTINGS, {
      confirm: async (message) => {
        asked = message;
        return false;
      },
    });
    expect(asked).toContain("80");
  });

  it("asks for a group of two, well under the volume threshold", async () => {
    const { sdk, updates } = makeSdk(0, 5);
    let asked = 0;
    await runFixGroup(
      sdk,
      [wrongStreet(), wrongStreet()],
      {
        status: "WRONG_STREET",
        suggestion: "Route de la Guerite",
        currentName: "Chemin de la Poste",
      },
      DEFAULT_SETTINGS,
      {
        confirm: async () => {
          asked += 1;
          return false;
        },
      },
    );
    expect(asked).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it("stays silent under the threshold for a cosmetic group", async () => {
    const { sdk, updates } = makeSdk(0, 5);
    let asked = 0;
    await runFixGroup(
      sdk,
      [issue(), issue()],
      { status: "COSMETIC", suggestion: "Avenue de Florimont" },
      DEFAULT_SETTINGS,
      {
        confirm: async () => {
          asked += 1;
          return true;
        },
      },
    );
    expect(asked).toBe(0);
    expect(updates).toHaveLength(2);
  });
});

describe("ignoreIssue", () => {
  const makeStore = (initial: string[] = []) => {
    let keys = initial;
    const store = {
      get: () => ({ ...DEFAULT_SETTINGS, ignoredKeys: keys }),
      update: (p: { ignoredKeys?: string[] }) => {
        if (p.ignoredKeys) keys = p.ignoredKeys;
      },
    };
    return { store: store as unknown as SettingsStore, keys: () => keys };
  };

  it("adds the issue key once and calls onComplete", () => {
    const { store, keys } = makeStore();
    let completed = false;
    const i = issue();
    ignoreIssue(store, i, () => (completed = true));
    expect(keys()).toHaveLength(1);
    expect(completed).toBe(true);
    // idempotent: re-ignoring the same issue does not duplicate the key
    ignoreIssue(store, i);
    expect(keys()).toHaveLength(1);
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
