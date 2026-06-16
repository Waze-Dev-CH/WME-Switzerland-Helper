import type { LineString } from "geojson";
import type { Segment, SegmentAddress } from "wme-sdk-typings";
import { describe, expect, it } from "vitest";
import { evaluateSegment, issueKey } from "../matching/evaluate";
import { nearestOfficial, SpatialIndex } from "../matching/spatial";
import { OfficialIndex } from "../matching/official-index";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { BIEL_STREETS, LAUSANNE_STREETS, makeOfficial } from "../fixtures/swiss-names";

const GEOMETRY: LineString = {
  type: "LineString",
  coordinates: [
    [6.63, 46.52],
    [6.64, 46.52],
  ],
};

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 1,
    roadType: 1,
    junctionId: null,
    length: 120,
    geometry: GEOMETRY,
    primaryStreetId: 100,
    alternateStreetIds: [],
    ...overrides,
  } as unknown as Segment;
}

function makeAddress(
  streetName: string | null,
  altNames: string[] = [],
  cityName: string | null = "Lausanne",
  countryAbbr = "CH",
): SegmentAddress {
  const city = cityName ? { id: 10, name: cityName } : null;
  return {
    street: streetName ? { id: 100, name: streetName } : null,
    country: { id: 1, abbr: countryAbbr, name: countryAbbr },
    city,
    state: null,
    isEmpty: streetName === null,
    altStreets: altNames.map((name) => ({
      street: { id: 200, name },
      city,
      state: null,
      country: null,
      isEmpty: false,
      altStreets: [],
    })),
  } as unknown as SegmentAddress;
}

const index = new OfficialIndex(LAUSANNE_STREETS);
const settings: Settings = { ...DEFAULT_SETTINGS };

describe("evaluateSegment", () => {
  it("skips segments outside Switzerland when the Swiss id is known", () => {
    const foreign = makeAddress("Rue de la Paix", [], "Pontarlier", "FR");
    (foreign as { country: { id: number } }).country.id = 2;
    const v = evaluateSegment(makeSegment(), foreign, index, settings, null, 1);
    expect(v.kind).toBe("skipped");
  });

  it("fails open when the Swiss country id is unknown", () => {
    const foreign = makeAddress("Rue du Grand-Pont", [], "Lausanne", "FR");
    (foreign as { country: { id: number } }).country.id = 2;
    const v = evaluateSegment(makeSegment(), foreign, index, settings, null, null);
    expect(v.kind).toBe("ok");
  });

  it("skips unchecked road types", () => {
    const v = evaluateSegment(
      makeSegment({ roadType: 4 } as Partial<Segment>),
      makeAddress("Whatever"),
      index,
      settings,
    );
    expect(v.kind).toBe("skipped");
  });

  it("skips unnamed roundabout segments", () => {
    const v = evaluateSegment(
      makeSegment({ junctionId: 42 } as Partial<Segment>),
      makeAddress(null),
      index,
      settings,
    );
    expect(v.kind).toBe("skipped");
  });

  it("flags unnamed segments with no official street underneath as UNNAMED_NO_MATCH (geometry on)", () => {
    // Default settings enable geometry matching; with no nearest official, the
    // segment is legitimately unnamed.
    const v = evaluateSegment(makeSegment(), makeAddress(null), index, settings);
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("UNNAMED_NO_MATCH");
      expect(v.issue.fixable).toBe(false);
    }
  });

  it("keeps unnamed segments as UNNAMED when geometry matching is off", () => {
    const noGeometry: Settings = { ...DEFAULT_SETTINGS, geometryMatching: false };
    const v = evaluateSegment(makeSegment(), makeAddress(null), index, noGeometry);
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("UNNAMED");
      expect(v.issue.fixable).toBe(false);
    }
  });

  it("accepts route designations on highway segments", () => {
    const v = evaluateSegment(
      makeSegment({ roadType: 3 } as Partial<Segment>),
      makeAddress("A9 - E62", ["A9", "E62"], null),
      index,
      { ...settings, checkedRoadTypes: [...settings.checkedRoadTypes, 3] },
    );
    expect(v.kind).toBe("ok");
  });

  it("does not accept route designations on plain streets", () => {
    const v = evaluateSegment(makeSegment(), makeAddress("A9"), index, settings);
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") expect(v.issue.status).toBe("NOT_FOUND");
  });

  it("returns ok for an exact match", () => {
    const v = evaluateSegment(makeSegment(), makeAddress("Rue du Grand-Pont"), index, settings);
    expect(v.kind).toBe("ok");
  });

  it("produces a fixable COSMETIC issue with the official spelling as suggestion", () => {
    const v = evaluateSegment(makeSegment(), makeAddress("rue du grand-pont"), index, settings);
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("COSMETIC");
      expect(v.issue.suggestion).toBe("Rue du Grand-Pont");
      expect(v.issue.fixable).toBe(true);
    }
  });

  it("produces a VARIANT issue for abbreviations", () => {
    const v = evaluateSegment(makeSegment(), makeAddress("Av. de Florimont"), index, settings);
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") expect(v.issue.status).toBe("VARIANT");
  });

  it("produces a NEAR issue for typos", () => {
    const v = evaluateSegment(makeSegment(), makeAddress("Avenue de Florimomt"), index, settings);
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("NEAR");
      expect(v.issue.suggestion).toBe("Avenue de Florimont");
    }
  });

  it("accepts an alternate-name match as okAlt", () => {
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Nom Fantaisiste", ["Rue du Grand-Pont"]),
      index,
      settings,
    );
    expect(v.kind).toBe("okAlt");
  });

  it("ignores alternates when the setting is off", () => {
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Nom Fantaisiste", ["Rue du Grand-Pont"]),
      index,
      { ...settings, altNameCountsAsOk: false },
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") expect(v.issue.status).toBe("NOT_FOUND");
  });

  it("flags WRONG_CITY under scoping when the name exists only elsewhere", () => {
    const scoped = new OfficialIndex([
      makeOfficial("Rue de la Gare", { zipLabel: "1009 Pully", comName: "Pully" }),
    ]);
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Rue de la Gare", [], "Lausanne"),
      scoped,
      { ...settings, cityScoping: "warn" },
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("WRONG_CITY");
      expect(v.issue.fixable).toBe(false);
    }
  });

  it("does not flag WRONG_CITY when scoping is off", () => {
    const scoped = new OfficialIndex([
      makeOfficial("Rue de la Gare", { zipLabel: "1009 Pully", comName: "Pully" }),
    ]);
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Rue de la Gare", [], "Lausanne"),
      scoped,
      settings,
    );
    expect(v.kind).toBe("ok");
  });
});

describe("geometry matching", () => {
  const LAT = 46.52;
  const axis = (label: string, northMeters: number, overrides = {}) =>
    makeOfficial(label, {
      lines: [
        [
          [6.6, LAT + northMeters / 110_574],
          [6.61, LAT + northMeters / 110_574],
        ],
      ],
      ...overrides,
    });
  const segGeometry = (northMeters: number): LineString => ({
    type: "LineString",
    coordinates: [
      [6.602, LAT + northMeters / 110_574],
      [6.604, LAT + northMeters / 110_574],
      [6.606, LAT + northMeters / 110_574],
      [6.608, LAT + northMeters / 110_574],
    ],
  });
  const nearestFor = (officials: ReturnType<typeof makeOfficial>[], north: number) => {
    const idx = new OfficialIndex(officials);
    return {
      idx,
      nearest: nearestOfficial(segGeometry(north), new SpatialIndex(idx.list)),
    };
  };

  it("UNNAMED gets a fixable suggestion from the street underneath", () => {
    const { idx, nearest } = nearestFor([axis("Route de la Guérite", 0)], 8);
    const v = evaluateSegment(
      makeSegment({ geometry: segGeometry(8) } as Partial<Segment>),
      makeAddress(null),
      idx,
      settings,
      nearest,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("UNNAMED");
      expect(v.issue.suggestion).toBe("Route de la Guérite");
      expect(v.issue.fixable).toBe(true);
    }
  });

  it("flags WRONG_STREET when the name is official far away but another street is underneath", () => {
    const officials = [
      axis("Route de Berne", 0),
      // the segment's name exists officially, but 200 m north
      axis("Chemin du Lac", 200),
    ];
    const { idx, nearest } = nearestFor(officials, 5);
    const v = evaluateSegment(
      makeSegment({ geometry: segGeometry(5) } as Partial<Segment>),
      makeAddress("Chemin du Lac"),
      idx,
      settings,
      nearest,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("WRONG_STREET");
      expect(v.issue.suggestion).toBe("Route de Berne");
      expect(v.issue.note?.ownDistanceM).toBeGreaterThan(150);
      expect(v.issue.note?.ownDistanceM).toBeLessThan(250);
    }
  });

  it("flags WRONG_STREET up front even when the name only needs a cosmetic fix", () => {
    // The current name is a near-match of "Chemin du Lac" (official 200 m away),
    // but the segment lies under "Route de Berne". Geometry must win first time:
    // without the hierarchy the editor would fix the spelling, then on the next
    // scan be told the street is wrong (two edits).
    const officials = [axis("Route de Berne", 0), axis("Chemin du Lac", 200)];
    const { idx, nearest } = nearestFor(officials, 5);
    const v = evaluateSegment(
      makeSegment({ geometry: segGeometry(5) } as Partial<Segment>),
      makeAddress("chemin du lac"),
      idx,
      settings,
      nearest,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("WRONG_STREET");
      expect(v.issue.suggestion).toBe("Route de Berne");
      expect(v.issue.note?.ownDistanceM).toBeGreaterThan(150);
    }
  });

  it("does NOT flag WRONG_STREET when the named street is also nearby (corner case)", () => {
    const officials = [axis("Route de Berne", 0), axis("Chemin du Lac", 20)];
    const { idx, nearest } = nearestFor(officials, 5);
    const v = evaluateSegment(
      makeSegment({ geometry: segGeometry(5) } as Partial<Segment>),
      makeAddress("Chemin du Lac"),
      idx,
      settings,
      nearest,
    );
    expect(v.kind).toBe("ok");
  });

  it("disambiguates a stem tie using the street underneath", () => {
    // two officials share the stem "moulin": set-based lookup stays ambiguous
    const officials = [axis("Route du Moulin", 0), axis("Rue du Moulin", 200)];
    const { idx, nearest } = nearestFor(officials, 5);
    const v = evaluateSegment(
      makeSegment({ geometry: segGeometry(5) } as Partial<Segment>),
      makeAddress("Chemin du Moulin"),
      idx,
      settings,
      nearest,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("WRONG_TYPE");
      expect(v.issue.suggestion).toBe("Route du Moulin");
    }
  });

  it("keeps the v0.8 behavior without nearest (geometry matching off)", () => {
    const officials = [axis("Route du Moulin", 0), axis("Rue du Moulin", 200)];
    const idx = new OfficialIndex(officials);
    const v = evaluateSegment(
      makeSegment({ geometry: segGeometry(5) } as Partial<Segment>),
      makeAddress("Chemin du Moulin"),
      idx,
      settings,
      null,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") expect(v.issue.status).toBe("NOT_FOUND");
  });
});

describe("BILINGUAL status", () => {
  const bielIndex = new OfficialIndex(BIEL_STREETS);

  it("splits a slash-in-primary name into first-language primary + other alternate", () => {
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Bielstrasse/Rue de Bienne", [], "Biel/Bienne"),
      bielIndex,
      settings,
      null,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("BILINGUAL");
      expect(v.issue.suggestion).toBe("Bielstrasse");
      expect(v.issue.note?.altLabels).toEqual(["Rue de Bienne"]);
    }
  });

  it("flags a single-language primary missing the other-language alternate", () => {
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Rue de Bienne", [], "Biel/Bienne"),
      bielIndex,
      settings,
      null,
    );
    expect(v.kind).toBe("issue");
    if (v.kind === "issue") {
      expect(v.issue.status).toBe("BILINGUAL");
      expect(v.issue.suggestion).toBe("Rue de Bienne"); // primary language kept
      expect(v.issue.note?.altLabels).toEqual(["Bielstrasse"]);
    }
  });

  it("is OK when the primary is one language and the other is already an alternate", () => {
    const v = evaluateSegment(
      makeSegment(),
      makeAddress("Rue de Bienne", ["Bielstrasse"], "Biel/Bienne"),
      bielIndex,
      settings,
      null,
    );
    expect(v.kind).toBe("ok");
  });
});

describe("issueKey", () => {
  const base = { segmentId: 42, status: "NOT_FOUND" as const, currentName: "Rue Test" };

  it("is stable for identical findings", () => {
    expect(issueKey(base)).toBe(issueKey({ ...base }));
  });

  it("differs when the status or the current name differs", () => {
    expect(issueKey(base)).not.toBe(issueKey({ ...base, status: "WRONG_STREET" }));
    expect(issueKey(base)).not.toBe(issueKey({ ...base, currentName: "Rue Autre" }));
    expect(issueKey(base)).not.toBe(issueKey({ ...base, segmentId: 43 }));
  });

  it("handles a null current name", () => {
    expect(issueKey({ ...base, currentName: null })).toContain("42 NOT_FOUND");
  });
});
