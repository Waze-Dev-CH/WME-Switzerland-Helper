import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import { cantonMapLink } from "../ui/canton-link";

const geometry: LineString = {
  type: "LineString",
  coordinates: [
    [6.74, 46.99],
    [6.76, 47.01],
  ],
};

// DOM assembly is exercised by the manual smoke test (no DOM env in vitest); here
// we cover the null guard, which returns before touching `document`.
describe("cantonMapLink", () => {
  it("returns null for a canton without a configured map or no canton", () => {
    expect(cantonMapLink(geometry, "Zürich")).toBeNull();
    expect(cantonMapLink(geometry, null)).toBeNull();
    expect(cantonMapLink(geometry, "Nowhere")).toBeNull();
  });
});
