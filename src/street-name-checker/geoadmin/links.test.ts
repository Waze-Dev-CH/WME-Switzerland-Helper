import { describe, expect, it } from "vitest";
import { mapGeoAdminUrl, wgs84ToLv95 } from "../geoadmin/links";

describe("wgs84ToLv95", () => {
  it("matches the swisstopo Rigi reference point within 2 m", () => {
    // WGS84 46°02'38.87" N, 8°43'49.79" E -> LV95 2700000 / 1100000
    const { e, n } = wgs84ToLv95(8.730497, 46.044131);
    expect(Math.abs(e - 2_700_000)).toBeLessThan(2);
    expect(Math.abs(n - 1_100_000)).toBeLessThan(2);
  });
});

describe("mapGeoAdminUrl", () => {
  it("builds a localized permalink with the register layer", () => {
    const url = mapGeoAdminUrl(7.438472, 46.951294, "fr");
    expect(url).toContain("map.geo.admin.ch");
    expect(url).toContain("lang=fr");
    expect(url).toContain("ch.swisstopo.amtliches-strassenverzeichnis");
    expect(url).toMatch(/E=25999\d\d/);
    expect(url).toMatch(/N=120002\d/);
  });
});
