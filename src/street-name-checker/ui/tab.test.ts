import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import type { Issue, IssueStatus } from "../matching/evaluate";
import { bboxOfIssues, formatNote, groupIssues, isDarkBackground } from "../ui/tab";
import { setLocale } from "../i18n";

const GEOMETRY: LineString = {
  type: "LineString",
  coordinates: [
    [6.63, 46.52],
    [6.64, 46.52],
  ],
};

let nextId = 1;

function issue(status: IssueStatus, currentName: string): Issue {
  return {
    segmentId: nextId++,
    status,
    currentName,
    suggestion: null,
    note: null,
    cityId: 1,
    cityName: "Lausanne",
    cantonName: "Vaud",
    roadType: 1,
    length: 100,
    geometry: GEOMETRY,
    fixable: false,
  };
}

describe("formatNote", () => {
  it("renders the lock delta (note holds 1-6 levels directly)", () => {
    setLocale("en");
    expect(formatNote({ currentLock: 3, expectedLock: 1 })).toBe("L3 → expected L1");
    setLocale("fr");
    expect(formatNote({ currentLock: 3, expectedLock: 1 })).toBe("L3 → attendu L1");
    setLocale("en");
  });

  it("returns an empty string for a null note", () => {
    expect(formatNote(null)).toBe("");
  });
});

describe("groupIssues ordering", () => {
  it("sorts by severity first, volume second", () => {
    const issues = [
      issue("UNNAMED", ""),
      issue("UNNAMED", ""),
      issue("UNNAMED", ""),
      issue("NOT_FOUND", "Espace Quarteron"),
      issue("COSMETIC", "Aéropole"),
      issue("VARIANT", "Route des Maréchets"),
      issue("VARIANT", "Route des Maréchets"),
      issue("WRONG_STREET", "Belle Ferme"),
    ];
    const order = groupIssues(issues).map((g) => g.status);
    expect(order).toEqual(["COSMETIC", "VARIANT", "WRONG_STREET", "NOT_FOUND", "UNNAMED"]);
  });

  it("sorts by volume inside the same severity", () => {
    const issues = [
      issue("VARIANT", "Petit Groupe"),
      issue("VARIANT", "Gros Groupe"),
      issue("VARIANT", "Gros Groupe"),
      issue("VARIANT", "Gros Groupe"),
    ];
    const names = groupIssues(issues).map((g) => g.currentName);
    expect(names).toEqual(["Gros Groupe", "Petit Groupe"]);
  });
});

describe("bboxOfIssues", () => {
  it("covers every segment of the group with padding", () => {
    const a = issue("VARIANT", "Rue A");
    const b = issue("VARIANT", "Rue B");
    b.geometry = {
      type: "LineString",
      coordinates: [
        [6.7, 46.6],
        [6.71, 46.61],
      ],
    };
    const bbox = bboxOfIssues([a, b]);
    expect(bbox).not.toBeNull();
    const [minLon, minLat, maxLon, maxLat] = bbox as [number, number, number, number];
    expect(minLon).toBeLessThan(6.63);
    expect(minLat).toBeLessThan(46.52);
    expect(maxLon).toBeGreaterThan(6.71);
    expect(maxLat).toBeGreaterThan(46.61);
  });

  it("keeps street-level context around a single short segment (padding floor)", () => {
    const bbox = bboxOfIssues([issue("NEAR", "Rue Courte")]);
    expect(bbox).not.toBeNull();
    const [minLon, , maxLon] = bbox as [number, number, number, number];
    expect(maxLon - minLon).toBeGreaterThanOrEqual(0.01 + 0.002 - 1e-9); // segment + 2 x lon floor
  });

  it("returns null when no issue carries coordinates", () => {
    const empty = issue("NOT_FOUND", "Rue Fantôme");
    empty.geometry = { type: "LineString", coordinates: [] };
    expect(bboxOfIssues([empty])).toBeNull();
    expect(bboxOfIssues([])).toBeNull();
  });
});

describe("isDarkBackground", () => {
  it("flags dark backgrounds", () => {
    expect(isDarkBackground("rgb(31, 34, 38)")).toBe(true);
  });

  it("flags light backgrounds", () => {
    expect(isDarkBackground("rgb(255, 255, 255)")).toBe(false);
  });

  it("returns null for transparent or unparseable colors", () => {
    expect(isDarkBackground("rgba(0, 0, 0, 0)")).toBeNull();
    expect(isDarkBackground("transparent")).toBeNull();
    expect(isDarkBackground("")).toBeNull();
  });
});
