import { describe, expect, it } from "vitest";
import { bboxAreaKm2, chunk, intersectsSwitzerland, isEditableByRank } from "./scan";

describe("intersectsSwitzerland", () => {
  it("accepts Swiss viewports", () => {
    expect(intersectsSwitzerland([6.6, 46.5, 6.65, 46.55])).toBe(true); // Lausanne
    expect(intersectsSwitzerland([9.8, 46.49, 9.85, 46.52])).toBe(true); // St. Moritz
  });

  it("accepts border viewports overlapping Switzerland", () => {
    expect(intersectsSwitzerland([5.85, 46.1, 6.2, 46.3])).toBe(true); // Geneva area
  });

  it("rejects viewports fully abroad", () => {
    expect(intersectsSwitzerland([2.2, 48.8, 2.45, 48.95])).toBe(false); // Paris
    expect(intersectsSwitzerland([11.3, 48.05, 11.7, 48.25])).toBe(false); // Munich
    expect(intersectsSwitzerland([7.0, 43.6, 7.4, 43.8])).toBe(false); // Nice
  });
});

describe("bboxAreaKm2", () => {
  it("stays under the auto-scan cap for a working-zoom viewport", () => {
    // ~2.2 x 2.2 km around Lausanne
    expect(bboxAreaKm2([6.62, 46.51, 6.649, 46.53])).toBeLessThan(6);
  });

  it("exceeds the auto-scan cap but not the sweep cap for a city-wide view", () => {
    // ~9.5 x 4.4 km, greater Lausanne
    const area = bboxAreaKm2([6.56, 46.5, 6.685, 46.54]);
    expect(area).toBeGreaterThan(6);
    expect(area).toBeLessThan(50);
  });

  it("exceeds the sweep cap for a regional view", () => {
    // ~30 x 22 km, Lausanne to Yverdon
    expect(bboxAreaKm2([6.5, 46.5, 6.9, 46.7])).toBeGreaterThan(50);
  });
});

describe("chunk", () => {
  it("splits into fixed-size batches with a shorter tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single batch when under the size", () => {
    expect(chunk([1, 2], 6)).toEqual([[1, 2]]);
  });

  it("handles an empty list", () => {
    expect(chunk([], 6)).toEqual([]);
  });
});

describe("isEditableByRank", () => {
  it("fails open when the rank is unknown", () => {
    expect(isEditableByRank(6, null)).toBe(true);
    expect(isEditableByRank(0, null)).toBe(true);
  });

  it("allows editing when the rank covers the lock", () => {
    expect(isEditableByRank(2, 4)).toBe(true);
  });

  it("allows editing at the exact lock level", () => {
    expect(isEditableByRank(3, 3)).toBe(true);
  });

  it("forbids editing when the lock is above the rank", () => {
    expect(isEditableByRank(5, 2)).toBe(false);
  });
});
