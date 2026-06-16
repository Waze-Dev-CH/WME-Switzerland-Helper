import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import type { Issue, IssueStatus } from "../matching/evaluate";
import { formatNote, groupIssues } from "../ui/tab";
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
