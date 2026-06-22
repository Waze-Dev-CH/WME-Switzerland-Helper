import type { LineString } from "geojson";
import { describe, expect, it } from "vitest";
import { cantonCodeFromName, cantonMapUrl, cantonMapUrlForGeometry } from "./canton-map";

describe("cantonCodeFromName", () => {
  it("resolves canton names across languages, case and accents", () => {
    expect(cantonCodeFromName("Neuchâtel")).toBe("ne");
    expect(cantonCodeFromName("Genève")).toBe("ge");
    expect(cantonCodeFromName("Geneva")).toBe("ge");
    expect(cantonCodeFromName("Genf")).toBe("ge");
    expect(cantonCodeFromName("Bern")).toBe("be");
    expect(cantonCodeFromName("Berne")).toBe("be");
    expect(cantonCodeFromName("Zürich")).toBe("zh");
    expect(cantonCodeFromName("  vaud ")).toBe("vd");
  });

  it("resolves bilingual canton names split on a slash", () => {
    expect(cantonCodeFromName("Fribourg / Freiburg")).toBe("fr");
    expect(cantonCodeFromName("Freiburg / Fribourg")).toBe("fr");
    expect(cantonCodeFromName("Valais / Wallis")).toBe("vs");
  });

  it("returns null for unknown or empty input", () => {
    expect(cantonCodeFromName("Nowhere")).toBeNull();
    expect(cantonCodeFromName(null)).toBeNull();
    expect(cantonCodeFromName(undefined)).toBeNull();
  });
});

describe("cantonMapUrl", () => {
  it("builds GeoMapFish URLs (map_x/map_y) for NE, SZ, TI, BL in LV95", () => {
    for (const [name, host] of [
      ["Neuchâtel", "sitn.ne.ch"],
      ["Schwyz", "map.geo.sz.ch"],
      ["Ticino", "map.geo.ti.ch"],
      ["Basel-Landschaft", "geoview.bl.ch"],
    ] as const) {
      const url = cantonMapUrl(name, 6.75, 47.0)!;
      expect(url).toContain(host);
      expect(url).toMatch(/map_x=2\d{6}/); // LV95 easting ~2.5M
      expect(url).toMatch(/map_y=1\d{6}/);
    }
  });

  it("builds center+scale URLs for Geneva and Vaud", () => {
    expect(cantonMapUrl("Genève", 6.14, 46.2)).toContain("map.sitg.ge.ch/app/");
    expect(cantonMapUrl("Genève", 6.14, 46.2)).toContain("center=");
    // VD: new geoportail.vd.ch viewer (center,scale,wkid) with the hybrid basemap.
    expect(cantonMapUrl("Vaud", 6.63, 46.52)).toContain("www.geoportail.vd.ch/map.htm");
    expect(cantonMapUrl("Vaud", 6.63, 46.52)).toContain("wkid=2056");
    expect(cantonMapUrl("Vaud", 6.63, 46.52)).toContain("theme=hybride");
  });

  it("builds the Bern and Solothurn specific URLs", () => {
    expect(cantonMapUrl("Bern", 7.44, 46.95)).toContain("topo.apps.be.ch");
    expect(cantonMapUrl("Bern", 7.44, 46.95)).toContain("addcrosshair=true");
    expect(cantonMapUrl("Solothurn", 7.53, 47.2)).toContain("geo.so.ch/map");
    expect(cantonMapUrl("Solothurn", 7.53, 47.2)).toContain("hc=1");
  });

  it("returns null for a canton with no configured map URL", () => {
    expect(cantonMapUrl("Zürich", 8.54, 47.37)).toBeNull();
    expect(cantonMapUrl("Nowhere", 8, 47)).toBeNull();
    // Recognised cantons whose recenter URL is not yet confirmed → no button.
    expect(cantonMapUrl("Valais", 7.36, 46.23)).toBeNull();
    expect(cantonMapUrl("Schaffhausen", 8.63, 47.7)).toBeNull();
    expect(cantonMapUrl("Fribourg", 7.16, 46.8)).toBeNull();
    expect(cantonMapUrl("Fribourg / Freiburg", 7.16, 46.8)).toBeNull();
    // JU and GR portals don't recenter usably → no button (still recognised by name).
    expect(cantonMapUrl("Jura", 7.16, 47.36)).toBeNull();
    expect(cantonMapUrl("Graubünden", 9.53, 46.85)).toBeNull();
  });
});

describe("cantonMapUrlForGeometry", () => {
  const geometry: LineString = {
    type: "LineString",
    coordinates: [
      [6.74, 46.99],
      [6.76, 47.01],
    ],
  };

  it("centers on the geometry midpoint for a known canton", () => {
    expect(cantonMapUrlForGeometry(geometry, "Neuchâtel")).toContain("sitn.ne.ch");
  });

  it("returns null for an unknown canton", () => {
    expect(cantonMapUrlForGeometry(geometry, "Zürich")).toBeNull();
  });

  it("returns null on empty geometry rather than a (0,0) out-of-Switzerland link", () => {
    const empty: LineString = { type: "LineString", coordinates: [] };
    expect(cantonMapUrlForGeometry(empty, "Neuchâtel")).toBeNull();
  });
});
