import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import type { Bbox } from "../geoadmin/types";
import { geometryIntersectsBbox } from "../ui/tab";

// Viewport over central Lausanne: [minLon, minLat, maxLon, maxLat].
const VIEWPORT: Bbox = [6.6, 46.51, 6.65, 46.53];

function line(coordinates: [number, number][]): LineString {
  return { type: "LineString", coordinates };
}

describe("geometryIntersectsBbox", () => {
  it("keeps a segment fully inside the viewport", () => {
    const geom = line([
      [6.62, 46.52],
      [6.63, 46.521],
    ]);
    expect(geometryIntersectsBbox(geom, VIEWPORT)).toBe(true);
  });

  it("drops a segment fully outside the viewport", () => {
    const geom = line([
      [6.7, 46.6],
      [6.71, 46.61],
    ]);
    expect(geometryIntersectsBbox(geom, VIEWPORT)).toBe(false);
  });

  it("keeps a segment that crosses the viewport without any vertex inside it", () => {
    // Both vertices sit outside (west and east), but the segment spans across.
    const geom = line([
      [6.5, 46.52],
      [6.8, 46.52],
    ]);
    expect(geometryIntersectsBbox(geom, VIEWPORT)).toBe(true);
  });

  it("keeps a segment that only touches the viewport edge", () => {
    const geom = line([
      [6.65, 46.52],
      [6.66, 46.52],
    ]);
    expect(geometryIntersectsBbox(geom, VIEWPORT)).toBe(true);
  });

  it("returns false for an empty geometry", () => {
    expect(geometryIntersectsBbox(line([]), VIEWPORT)).toBe(false);
  });
});
