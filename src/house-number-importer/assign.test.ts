import { describe, expect, it } from "vitest";
import { assignToSegments, countSegments, distanceToSegmentM } from "./assign";
import type { GwrPoint } from "./gwr/types";

/** Two consecutive pieces of one street, running east from [6.6, 46.5]. */
const WEST_PIECE = [
  [6.6, 46.5],
  [6.605, 46.5],
];
const EAST_PIECE = [
  [6.605, 46.5],
  [6.61, 46.5],
];

const point = (number: string, lon: number, lat = 46.5): GwrPoint => ({
  id: `p-${number}`,
  number,
  streetNames: ["Rue Exemple"],
  esid: 1,
  lon,
  lat,
  officialAddress: true,
});

describe("distanceToSegmentM", () => {
  it("is zero on the line and grows away from it", () => {
    expect(distanceToSegmentM(WEST_PIECE, point("1", 6.602))).toBeLessThan(1);
    expect(distanceToSegmentM(WEST_PIECE, point("1", 6.602, 46.503))).toBeGreaterThan(300);
  });
});

describe("assignToSegments", () => {
  const geometries = new Map([
    [1, WEST_PIECE],
    [2, EAST_PIECE],
  ]);

  it("hangs each number on the piece of street it actually stands on", () => {
    // The whole point of the module: before it, every number went to the selected segment,
    // so a number 400 m down the same street was rejected as "too far" and the batch died
    // on its first entry.
    const { assignments } = assignToSegments(
      [point("2", 6.601), point("40", 6.609)],
      geometries,
      150,
    );
    expect(assignments.map((a) => a.segmentId)).toEqual([1, 2]);
  });

  it("reports a point with no segment of that street within reach", () => {
    const { assignments, unreachable } = assignToSegments(
      [point("2", 6.601), point("99", 6.601, 46.52)],
      geometries,
      150,
    );
    expect(assignments).toHaveLength(1);
    expect(unreachable.map((p) => p.number)).toEqual(["99"]);
  });

  it("keeps the distance it settled on, so the caller can explain a refusal", () => {
    const { assignments } = assignToSegments([point("2", 6.601)], geometries, 150);
    expect(assignments[0].distanceM).toBeLessThan(5);
  });

  it("declares everything unreachable when no segment geometry is known", () => {
    const { assignments, unreachable } = assignToSegments([point("2", 6.601)], new Map(), 150);
    expect(assignments).toHaveLength(0);
    expect(unreachable).toHaveLength(1);
  });
});

describe("countSegments", () => {
  it("counts the distinct segments a batch would touch", () => {
    const geometries = new Map([
      [1, WEST_PIECE],
      [2, EAST_PIECE],
    ]);
    const { assignments } = assignToSegments(
      [point("2", 6.601), point("4", 6.602), point("40", 6.609)],
      geometries,
      150,
    );
    expect(countSegments(assignments)).toBe(2);
  });
});
