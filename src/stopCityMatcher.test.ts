import { describe, it, expect } from "vitest";
import { findCityForStop } from "./stopCityMatcher";

interface FakeCity {
  id: number;
  name: string;
}

function lookupFrom(cities: FakeCity[]) {
  return (cityName: string): FakeCity | null =>
    cities.find((c) => c.name === cityName) ?? null;
}

describe("findCityForStop", () => {
  it("matches a city by exact locality name", () => {
    const lookup = lookupFrom([{ id: 1, name: "Hauterive NE" }]);
    expect(findCityForStop("Hauterive NE", lookup)).toEqual({
      id: 1,
      name: "Hauterive NE",
    });
  });

  it("falls back to the name without the canton suffix", () => {
    // WME has "Brügg" but the stop's locality is "Brügg BE".
    const lookup = lookupFrom([{ id: 2, name: "Brügg" }]);
    expect(findCityForStop("Brügg BE", lookup)).toEqual({
      id: 2,
      name: "Brügg",
    });
  });

  it("returns null when no city matches", () => {
    const lookup = lookupFrom([{ id: 3, name: "Neuchâtel" }]);
    expect(findCityForStop("Boveresse", lookup)).toBeNull();
  });

  it("does not strip a suffix that is not an uppercase canton abbreviation", () => {
    const lookup = lookupFrom([{ id: 4, name: "Boveresse" }]);
    // "Boveresse" has no canton suffix; only the exact lookup is tried.
    expect(findCityForStop("Boveresse", lookup)).toEqual({
      id: 4,
      name: "Boveresse",
    });
  });
});
