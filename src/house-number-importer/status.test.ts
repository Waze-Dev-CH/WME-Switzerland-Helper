import { describe, expect, it, vi } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import {
  collectStreetScopedSegmentIds,
  fetchExistingNumbers,
  segmentStreetNames,
} from "./existing";
import type { GwrPoint } from "./gwr/types";
import { matchesSegmentStreet } from "./matching";
import { compareHouseNumbers, computeStatuses, missingPoints, normalizeNumber } from "./status";

const point = (number: string, streetNames = ["Rue Exemple"]): GwrPoint => ({
  id: `p-${number}`,
  number,
  streetNames,
  esid: 10000001,
  lon: 6.6,
  lat: 46.5,
  officialAddress: true,
});

describe("matchesSegmentStreet", () => {
  it("matches an identical name", () => {
    expect(matchesSegmentStreet(["Rue Exemple"], ["Rue Exemple"])).toBe(true);
  });

  it("matches the German name of a bilingual commune against a German segment", () => {
    // Biel/Bienne: every entry carries both names, so a Zentralstrasse segment must match.
    expect(matchesSegmentStreet(["Rue Centrale", "Zentralstrasse"], ["Zentralstrasse"])).toBe(true);
  });

  it("matches an abbreviated segment name against the official one", () => {
    expect(matchesSegmentStreet(["Route de Berne"], ["Rte de Berne"])).toBe(true);
    expect(matchesSegmentStreet(["Bahnhofstrasse"], ["Bahnhofstr."])).toBe(true);
  });

  it("matches through an alternate name", () => {
    expect(matchesSegmentStreet(["Zentralstrasse"], ["Rue Centrale", "Zentralstrasse"])).toBe(true);
  });

  it("ignores case and accent typography", () => {
    expect(matchesSegmentStreet(["Rue de la Forêt"], ["RUE DE LA FORÊT"])).toBe(true);
  });

  it("refuses two genuinely different streets", () => {
    // A wrong match here creates a house number on the wrong street, so strict stays strict.
    expect(matchesSegmentStreet(["Rue du Lac"], ["Rue des Lacs"])).toBe(false);
  });

  it("accepts a near miss only in loose mode", () => {
    expect(matchesSegmentStreet(["Rue du Lac"], ["Rue du Lacs"], "strict")).toBe(false);
    expect(matchesSegmentStreet(["Rue du Lac"], ["Rue du Lacs"], "loose")).toBe(true);
  });

  it("refuses when either side has no name", () => {
    expect(matchesSegmentStreet([], ["Rue Exemple"])).toBe(false);
    expect(matchesSegmentStreet(["Rue Exemple"], [])).toBe(false);
  });
});

describe("normalizeNumber", () => {
  it.each([
    ["15 a", "15A"],
    ["15a", "15A"],
    ["15A", "15A"],
    [" 15 ", "15"],
  ])("reads %s as %s", (input, expected) => {
    expect(normalizeNumber(input)).toBe(expected);
  });

  it("keeps a range distinct from its first number", () => {
    expect(normalizeNumber("15-17")).not.toBe(normalizeNumber("15"));
  });
});

describe("computeStatuses", () => {
  const points = [point("15"), point("17"), point("2", ["Autre Rue"])];

  it("marks everything neutral without a selection", () => {
    const statuses = computeStatuses({
      points,
      segmentNames: null,
      existingNumbers: new Set(),
    });
    expect(statuses.map((s) => s.status)).toEqual(["NEUTRAL", "NEUTRAL", "NEUTRAL"]);
  });

  it("splits missing, present and other-street", () => {
    const statuses = computeStatuses({
      points,
      segmentNames: ["Rue Exemple"],
      existingNumbers: new Set(["15"]),
    });
    expect(statuses.map((s) => s.status)).toEqual(["PRESENT", "MISSING", "OTHER_STREET"]);
  });

  it("treats a number that differs only by letter case as present", () => {
    const statuses = computeStatuses({
      points: [point("15a")],
      segmentNames: ["Rue Exemple"],
      existingNumbers: new Set(["15A"]),
    });
    expect(statuses[0].status).toBe("PRESENT");
  });

  it("holds matching points neutral while the existing numbers are unknown", () => {
    // Painting them MISSING before fetchHouseNumbers resolves invites a duplicate during
    // the round trip; only "other street" can be decided without that answer.
    const statuses = computeStatuses({
      points,
      segmentNames: ["Rue Exemple"],
      existingNumbers: null,
    });
    expect(statuses.map((s) => s.status)).toEqual(["NEUTRAL", "NEUTRAL", "OTHER_STREET"]);
  });
});

describe("missingPoints", () => {
  it("returns only the missing ones, in printed-number order", () => {
    const statused = computeStatuses({
      points: [point("10"), point("2"), point("4")],
      segmentNames: ["Rue Exemple"],
      existingNumbers: new Set(),
    });
    expect(missingPoints(statused).map((p) => p.number)).toEqual(["2", "4", "10"]);
  });

  it("orders letter suffixes after their bare number", () => {
    expect(compareHouseNumbers("15", "15a")).toBeLessThan(0);
  });
});

interface FakeSegment {
  id: number;
  coordinates: number[][];
  names: string[];
}

function makeSdk(segments: FakeSegment[], houseNumbers: string[] = []) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  return {
    DataModel: {
      Segments: {
        getAll: () =>
          segments.map((segment) => ({
            id: segment.id,
            geometry: { type: "LineString", coordinates: segment.coordinates },
          })),
        getAddress: ({ segmentId }: { segmentId: number }) => {
          const segment = byId.get(segmentId);
          if (!segment) throw new Error("unknown segment");
          const [primary, ...alternates] = segment.names;
          return {
            street: primary ? { name: primary } : null,
            altStreets: alternates.map((name) => ({ street: { name } })),
          };
        },
      },
      HouseNumbers: {
        fetchHouseNumbers: () => Promise.resolve(houseNumbers.map((number) => ({ number }))),
      },
    },
  } as unknown as WmeSDK;
}

describe("segmentStreetNames", () => {
  it("returns the primary name and the alternates", () => {
    const sdk = makeSdk([
      { id: 1, coordinates: [[6.6, 46.5]], names: ["Rue Centrale", "Zentralstrasse"] },
    ]);
    expect(segmentStreetNames(sdk, 1)).toEqual(["Rue Centrale", "Zentralstrasse"]);
  });

  it("returns nothing rather than throwing on an unloaded segment", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(segmentStreetNames(makeSdk([]), 999)).toEqual([]);
    warn.mockRestore();
  });
});

describe("collectStreetScopedSegmentIds", () => {
  const area: [number, number, number, number] = [6.6, 46.5, 6.61, 46.51];

  it("includes the neighbouring segments of the same street", () => {
    // WME splits a street at every junction: number 15 often sits on the piece next door.
    const sdk = makeSdk([
      { id: 1, coordinates: [[6.6, 46.5]], names: ["Rue Exemple"] },
      { id: 2, coordinates: [[6.605, 46.505]], names: ["Rue Exemple"] },
      { id: 3, coordinates: [[6.605, 46.505]], names: ["Autre Rue"] },
    ]);
    expect(collectStreetScopedSegmentIds(sdk, 1, area)).toEqual([1, 2]);
  });

  it("ignores a same-named segment that is far away", () => {
    const sdk = makeSdk([
      { id: 1, coordinates: [[6.6, 46.5]], names: ["Rue Exemple"] },
      { id: 2, coordinates: [[7.5, 47.5]], names: ["Rue Exemple"] },
    ]);
    expect(collectStreetScopedSegmentIds(sdk, 1, area)).toEqual([1]);
  });

  it("falls back to the selection alone when it has no name", () => {
    const sdk = makeSdk([{ id: 1, coordinates: [[6.6, 46.5]], names: [] }]);
    expect(collectStreetScopedSegmentIds(sdk, 1, area)).toEqual([1]);
  });
});

describe("fetchExistingNumbers", () => {
  it("normalizes what the SDK returns", async () => {
    const sdk = makeSdk(
      [{ id: 1, coordinates: [[6.6, 46.5]], names: ["Rue Exemple"] }],
      ["15 a", "17"],
    );
    expect(await fetchExistingNumbers(sdk, [1])).toEqual(new Set(["15A", "17"]));
  });

  it("asks nothing when there is no segment", async () => {
    expect(await fetchExistingNumbers(makeSdk([]), [])).toEqual(new Set());
  });
});
