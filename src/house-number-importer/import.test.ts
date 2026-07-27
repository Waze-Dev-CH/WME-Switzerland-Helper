import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import type { Assignment } from "./assign";
import type { GwrPoint } from "./gwr/types";
import { distanceToSegmentM } from "./assign";
import {
  IMPORT_CAP,
  importPoint,
  importPoints,
  isImportInFlight,
  MAX_SNAP_DISTANCE_M,
  runImportPoint,
  runImportPoints,
  withImportLock,
} from "./import";

/** Runs east from [6.6, 46.5] for ~760 m. */
const SEGMENT_COORDINATES = [
  [6.6, 46.5],
  [6.61, 46.5],
];

const point = (number: string, overrides: Partial<GwrPoint> = {}): GwrPoint => ({
  id: `p-${number}`,
  number,
  streetNames: ["Rue Exemple"],
  esid: 10000001,
  lon: 6.6,
  lat: 46.5,
  officialAddress: true,
  ...overrides,
});

/** Every number now carries the segment it hangs from, so batches can span a street. */
const at = (p: GwrPoint, segmentId = 1): Assignment => ({ point: p, segmentId, distanceM: 0 });

interface SdkOptions {
  editingAllowed?: boolean;
  segmentExists?: boolean;
  throwOnAdd?: Error;
}

function makeSdk(options: SdkOptions = {}) {
  const added: Array<{ number: string; segmentId: number; coordinates: number[] }> = [];
  const sdk = {
    Editing: { isEditingAllowed: () => options.editingAllowed ?? true },
    DataModel: {
      Segments: {
        getById: ({ segmentId }: { segmentId: number }) =>
          options.segmentExists === false
            ? null
            : { id: segmentId, geometry: { type: "LineString", coordinates: SEGMENT_COORDINATES } },
      },
      HouseNumbers: {
        addHouseNumber: (args: {
          number: string;
          point: { coordinates: number[] };
          segmentId: number;
        }) => {
          if (options.throwOnAdd) throw options.throwOnAdd;
          added.push({
            number: args.number,
            segmentId: args.segmentId,
            coordinates: args.point.coordinates,
          });
        },
      },
    },
  } as unknown as WmeSDK;
  return { sdk, added };
}

describe("distanceToSegmentM", () => {
  it("is zero on the line and grows away from it", () => {
    expect(distanceToSegmentM(SEGMENT_COORDINATES, point("1"))).toBeLessThan(1);
    const north = point("2", { lat: 46.503 });
    expect(distanceToSegmentM(SEGMENT_COORDINATES, north)).toBeGreaterThan(300);
  });
});

describe("importPoint", () => {
  it("creates the number at the register coordinates, on the given segment", () => {
    const { sdk, added } = makeSdk();
    const outcome = importPoint(sdk, point("15"), 123456);

    expect(outcome.ok).toBe(true);
    // The coordinates are the register's own, not wherever the editor clicked.
    expect(added).toEqual([{ number: "15", segmentId: 123456, coordinates: [6.6, 46.5] }]);
  });

  it("always passes segmentId, never letting the SDK guess the closest segment", () => {
    const { sdk, added } = makeSdk();
    importPoint(sdk, point("15"), 999);
    expect(added[0].segmentId).toBe(999);
  });

  it("refuses when editing is not allowed", () => {
    const { sdk, added } = makeSdk({ editingAllowed: false });
    expect(importPoint(sdk, point("15"), 1)).toMatchObject({ ok: false, error: "errNotAllowed" });
    expect(added).toHaveLength(0);
  });

  it("refuses a point further than the snap distance", () => {
    const { sdk, added } = makeSdk();
    const far = point("15", { lat: 46.51 }); // ~1.1 km north of the segment
    const outcome = importPoint(sdk, far, 1);

    expect(outcome).toMatchObject({ ok: false, error: "errTooFar" });
    expect(outcome.distance).toBeGreaterThan(MAX_SNAP_DISTANCE_M);
    expect(added).toHaveLength(0);
  });

  it("reports an unloaded segment", () => {
    const { sdk } = makeSdk({ segmentExists: false });
    expect(importPoint(sdk, point("15"), 1)).toMatchObject({
      ok: false,
      error: "errSegmentNotFound",
    });
  });

  it.each([
    ["DataModelNotFoundError", "errSegmentNotFound"],
    ["InvalidStateError", "errInvalidState"],
  ])("maps a %s thrown by the SDK", (name, expected) => {
    const error = new Error("boom");
    error.name = name;
    const { sdk } = makeSdk({ throwOnAdd: error });
    expect(importPoint(sdk, point("15"), 1)).toMatchObject({ ok: false, error: expected });
  });

  it("maps an unexpected throw without losing it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sdk } = makeSdk({ throwOnAdd: new Error("weird") });
    expect(importPoint(sdk, point("15"), 1)).toMatchObject({ ok: false, error: "errUnknown" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("importPoints", () => {
  it("never creates more than the cap, whatever it is handed", async () => {
    // The cap lives here, not in the buttons: three UI surfaces trigger an import and a
    // limit enforced only in the UI is one missed check away from being gone.
    const { sdk, added } = makeSdk();
    const many = Array.from({ length: IMPORT_CAP + 10 }, (_, i) => point(String(i + 1)));

    const outcomes = await importPoints(sdk, many.map((p) => at(p)));

    expect(added).toHaveLength(IMPORT_CAP);
    expect(outcomes).toHaveLength(IMPORT_CAP);
  });

  it("stops at the first failure instead of pressing on", async () => {
    const { sdk, added } = makeSdk();
    const points = [point("2"), point("4", { lat: 46.51 }), point("6")];

    const outcomes = await importPoints(sdk, points.map((p) => at(p)));

    expect(added.map((entry) => entry.number)).toEqual(["2"]);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[1]).toMatchObject({ ok: false, error: "errTooFar" });
  });

  it("reports progress as it goes", async () => {
    const { sdk } = makeSdk();
    const progress: Array<[number, number]> = [];
    await importPoints(sdk, [at(point("2")), at(point("4"))], (done, total) =>
      progress.push([done, total]),
    );
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("importPoints duplicate guard", () => {
  it("skips a number the caller already knows about", async () => {
    // Clicking the button twice before saving used to recreate the whole batch: the UI's
    // view of "what exists" lags, because fetchHouseNumbers does not see pending edits.
    const { sdk, added } = makeSdk();
    const assignments = [at(point("2")), at(point("4"))];

    await importPoints(sdk, assignments, undefined, new Set(["2"]));

    expect(added.map((entry) => entry.number)).toEqual(["4"]);
  });

  it("creates nothing at all when everything is already there", async () => {
    const { sdk, added } = makeSdk();
    await importPoints(sdk, [at(point("2")), at(point("4"))], undefined, new Set(["2", "4"]));
    expect(added).toHaveLength(0);
  });

  it("ignores letter case and spacing when comparing", async () => {
    const { sdk, added } = makeSdk();
    await importPoints(sdk, [at(point("15a"))], undefined, new Set(["15A"]));
    expect(added).toHaveLength(0);
  });

  it("does not create the same number twice within one batch", async () => {
    const { sdk, added } = makeSdk();
    await importPoints(sdk, [at(point("2")), at(point("2"))]);
    expect(added).toHaveLength(1);
  });
});

describe("withImportLock", () => {
  it("ignores a second run while one is in flight", async () => {
    let release = (): void => undefined;
    const first = withImportLock(
      () => new Promise<string>((resolve) => (release = () => resolve("first"))),
    );
    expect(isImportInFlight()).toBe(true);
    expect(await withImportLock(async () => "second")).toBeNull();

    release();
    expect(await first).toBe("first");
    expect(isImportInFlight()).toBe(false);
  });
});

describe("runImportPoints", () => {
  beforeEach(async () => {
    // Make sure no earlier test left the module-level lock held.
    await withImportLock(async () => undefined);
  });

  it("creates nothing when the confirmation is declined", async () => {
    const { sdk, added } = makeSdk();
    const confirm = vi.fn(async () => false);

    await runImportPoints(sdk, [at(point("2")), at(point("4"))], 1, "Rue Exemple", {
      confirm,
      notify: async () => undefined,
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(added).toHaveLength(0);
  });

  it("lists the numbers and the street in the confirmation", async () => {
    const { sdk } = makeSdk();
    let message = "";
    await runImportPoints(sdk, [at(point("4")), at(point("2"))], 1, "Rue Exemple", {
      confirm: async (text) => {
        message = text;
        return false;
      },
      notify: async () => undefined,
    });

    expect(message).toContain("Rue Exemple");
    expect(message).toContain("2, 4"); // sorted, not in arrival order
    expect(message).toMatch(/nothing is saved/i);
    // Forty numbers in one click should not read as "and they are all correct": the
    // register's entrance point is usually right, not always.
    expect(message).toMatch(/check the result/i);
  });

  it("announces the cap when more numbers are missing than it allows", async () => {
    const { sdk } = makeSdk();
    const many = Array.from({ length: IMPORT_CAP + 7 }, (_, i) => point(String(i + 1)));
    let message = "";

    await runImportPoints(sdk, many.map((p) => at(p)), 1, "Rue Exemple", {
      confirm: async (text) => {
        message = text;
        return false;
      },
      notify: async () => undefined,
    });

    expect(message).toContain(String(IMPORT_CAP));
    expect(message).toContain(String(many.length));
  });

  it("imports and reports the count once confirmed", async () => {
    const { sdk, added } = makeSdk();
    const notify = vi.fn(async () => undefined);
    const onComplete = vi.fn();

    await runImportPoints(sdk, [at(point("2")), at(point("4"))], 1, "Rue Exemple", {
      confirm: async () => true,
      notify,
      onComplete,
    });

    expect(added).toHaveLength(2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all on an empty list", async () => {
    const { sdk } = makeSdk();
    const confirm = vi.fn(async () => true);
    await runImportPoints(sdk, [], 1, "Rue Exemple", { confirm });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("runImportPoint", () => {
  beforeEach(async () => {
    await withImportLock(async () => undefined);
  });

  it("creates without asking by default", async () => {
    const { sdk, added } = makeSdk();
    const confirm = vi.fn(async () => true);

    await runImportPoint(sdk, point("15"), 1, "Rue Exemple", { confirmSingle: false, confirm });

    expect(confirm).not.toHaveBeenCalled();
    expect(added).toHaveLength(1);
  });

  it("asks first when the editor opted in", async () => {
    const { sdk, added } = makeSdk();
    await runImportPoint(sdk, point("15"), 1, "Rue Exemple", {
      confirmSingle: true,
      confirm: async () => false,
    });
    expect(added).toHaveLength(0);
  });

  it("tells the editor why a click did nothing", async () => {
    const { sdk } = makeSdk({ editingAllowed: false });
    const notify = vi.fn(async () => undefined);

    await runImportPoint(sdk, point("15"), 1, "Rue Exemple", { confirmSingle: false, notify });

    expect(notify).toHaveBeenCalledTimes(1);
  });
});
