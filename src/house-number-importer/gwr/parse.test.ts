import { describe, expect, it } from "vitest";
import { dedupePoints, isSubEntryNumber, parseGwrFeature, parseStreetNames } from "./parse";
import type { GwrPoint } from "./types";

/**
 * Shape of a real `identify` result on ch.bfs.gebaeude_wohnungs_register, trimmed to the
 * fields the parser reads. The live response carries ~60 more (heating, dwellings, dates).
 */
function feature(overrides: Record<string, unknown> = {}, geometry: unknown = undefined) {
  return {
    type: "Feature",
    geometry: geometry === undefined ? { type: "Point", coordinates: [6.6, 46.5] } : geometry,
    properties: {
      egid: "999001",
      edid: "0",
      esid: 10000001,
      deinr: "15",
      strname: ["Rue Exemple"],
      strname_deinr: "Rue Exemple 15",
      gstat: 1004,
      doffadr: 1,
      ...overrides,
    },
  };
}

describe("parseStreetNames", () => {
  it("keeps every name of a bilingual commune, in order", () => {
    // Biel/Bienne carries both names on every single entry.
    expect(parseStreetNames(["Rue Centrale", "Zentralstrasse"])).toEqual([
      "Rue Centrale",
      "Zentralstrasse",
    ]);
  });

  it("accepts a plain string, as monolingual communes return", () => {
    expect(parseStreetNames("Rue Exemple")).toEqual(["Rue Exemple"]);
  });

  it("drops blanks, non-strings and duplicates", () => {
    expect(parseStreetNames(["  Rue Exemple  ", "", null, 42, "Rue Exemple"])).toEqual([
      "Rue Exemple",
    ]);
  });

  it("returns nothing for a missing field", () => {
    expect(parseStreetNames(undefined)).toEqual([]);
  });
});

describe("isSubEntryNumber", () => {
  it.each(["15.1", "15a.1", "7.12", "15A.2"])("rejects the sub-entry %s", (value) => {
    expect(isSubEntryNumber(value)).toBe(true);
  });

  it.each(["15", "15a", "15A", "15-17", "15/17"])("keeps the house number %s", (value) => {
    expect(isSubEntryNumber(value)).toBe(false);
  });
});

describe("parseGwrFeature", () => {
  it("reads a plain entry", () => {
    expect(parseGwrFeature(feature())).toEqual({
      id: "999001:0",
      number: "15",
      streetNames: ["Rue Exemple"],
      esid: 10000001,
      lon: 6.6,
      lat: 46.5,
      officialAddress: true,
    });
  });

  it("reads Esri-style `attributes` as well as geojson `properties`", () => {
    // The checker shipped a release that stored empty tiles by assuming one of the two.
    const { properties, ...rest } = feature();
    expect(parseGwrFeature({ ...rest, attributes: properties })?.number).toBe("15");
  });

  it("drops a sub-entry number", () => {
    expect(parseGwrFeature(feature({ deinr: "15.1" }))).toBeNull();
  });

  it("drops an entry without a number", () => {
    expect(parseGwrFeature(feature({ deinr: "", strname_deinr: "" }))).toBeNull();
  });

  it("falls back to the combined field when deinr is missing", () => {
    const parsed = parseGwrFeature(
      feature({ deinr: null, strname: [], strname_deinr: "Chemin des Vignes 12a" }),
    );
    expect(parsed).toMatchObject({ number: "12a", streetNames: ["Chemin des Vignes"] });
  });

  it("drops a building that is not standing", () => {
    // 1002 = authorized, 1003 = under construction: their addresses do not exist yet.
    expect(parseGwrFeature(feature({ gstat: 1002 }))).toBeNull();
  });

  it("keeps a non-standing building when the filter is off", () => {
    const parsed = parseGwrFeature(feature({ gstat: 1002 }), { existingBuildingsOnly: false });
    expect(parsed?.number).toBe("15");
  });

  it("keeps an entry whose status the API did not send", () => {
    // Treating "missing" as "not built" would silently empty the map on an API change.
    expect(parseGwrFeature(feature({ gstat: undefined }))?.number).toBe("15");
  });

  it.each([
    ["missing geometry", null],
    ["a non-point geometry", { type: "LineString", coordinates: [[6.6, 46.5]] }],
    ["non-numeric coordinates", { type: "Point", coordinates: ["6.6", "46.5"] }],
  ])("drops an entry with %s", (_label, geometry) => {
    expect(parseGwrFeature(feature({}, geometry))).toBeNull();
  });

  it("falls back to coordinates for the id when the building id is absent", () => {
    const parsed = parseGwrFeature(feature({ egid: "" }));
    expect(parsed?.id).toBe("6.600000:46.500000:15");
  });

  it("flags a secondary entrance", () => {
    expect(parseGwrFeature(feature({ doffadr: 0 }))?.officialAddress).toBe(false);
  });
});

describe("dedupePoints", () => {
  const point = (overrides: Partial<GwrPoint>): GwrPoint => ({
    id: "1:0",
    number: "15",
    streetNames: ["Rue Exemple"],
    esid: 1,
    lon: 6.6,
    lat: 46.5,
    officialAddress: false,
    ...overrides,
  });

  it("keeps one entry per street and number", () => {
    // Measured on real data: 2 duplicated (esid, deinr) pairs out of 686 in one bbox.
    expect(dedupePoints([point({ id: "a" }), point({ id: "b" })])).toHaveLength(1);
  });

  it("prefers the official address over a secondary entrance", () => {
    const kept = dedupePoints([point({ id: "a" }), point({ id: "b", officialAddress: true })]);
    expect(kept[0].id).toBe("b");
  });

  it("keeps different numbers of the same street", () => {
    expect(dedupePoints([point({ number: "15" }), point({ number: "17" })])).toHaveLength(2);
  });

  it("keeps the same number on two different streets", () => {
    expect(dedupePoints([point({ esid: 1 }), point({ esid: 2 })])).toHaveLength(2);
  });
});
