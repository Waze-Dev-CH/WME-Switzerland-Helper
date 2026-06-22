import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import type { Issue } from "../matching/evaluate";
import { issuesInSameGroup } from "../ui/edit-panel";

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
    status: "WRONG_TYPE",
    currentName: "Chemin de la Guérite",
    suggestion: "Route de la Guérite",
    note: null,
    cityId: 1,
    cityName: "Avenches",
    cantonName: "Vaud",
    roadType: 1,
    length: 100,
    geometry: GEOMETRY,
    fixable: true,
    ...overrides,
  };
}

describe("issuesInSameGroup", () => {
  it("collects every issue with the same status, name and suggestion", () => {
    const a = issue();
    const b = issue();
    const other = issue({ currentName: "Chemin de Montaz", suggestion: "Chemin de la Montaz" });
    const map = new Map([a, b, other].map((i) => [i.segmentId, i]));
    const group = issuesInSameGroup(map, a);
    expect(group.map((i) => i.segmentId).sort()).toEqual([a.segmentId, b.segmentId].sort());
  });

  it("distinguishes identical names with different statuses", () => {
    const a = issue();
    const b = issue({ status: "NEAR" });
    const map = new Map([a, b].map((i) => [i.segmentId, i]));
    expect(issuesInSameGroup(map, a)).toHaveLength(1);
  });

  it("returns the reference issue alone when nothing else matches", () => {
    const a = issue();
    const map = new Map([[a.segmentId, a]]);
    expect(issuesInSameGroup(map, a)).toEqual([a]);
  });
});
