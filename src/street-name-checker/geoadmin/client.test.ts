import { describe, expect, it } from "vitest";
import { extractLines, fetchOfficialStreets, parseAttributes, RateLimiter } from "../geoadmin/client";

/** Shape regression test: geometryFormat=geojson responses carry `properties`,
 *  not `attributes` (real sample from the Avenches bbox, 2026-06-12). */
const GEOJSON_RESULT = {
  type: "Feature",
  featureId: 10061353,
  id: 10061353,
  layerBodId: "ch.swisstopo.amtliches-strassenverzeichnis",
  layerName: "Amtliches Strassenverzeichnis",
  bbox: [7.03, 46.87, 7.05, 46.89],
  properties: {
    str_esid: 10061353,
    stn_label: "Vy-d'Avenches",
    zip_label: "1564 Domdidier, 1580 Avenches",
    com_name: "Avenches",
    com_fosnr: 5451,
    str_official: 1,
    str_modified: "2026-01-15",
    str_type: "Strasse",
    str_status: "bestehend",
    label: "Vy-d'Avenches",
  },
  geometry: {
    type: "MultiLineString",
    coordinates: [
      [
        [7.035, 46.875],
        [7.036, 46.876],
      ],
    ],
  },
};

describe("parseAttributes", () => {
  it("parses a geojson-mode result through properties", () => {
    const street = parseAttributes(
      GEOJSON_RESULT.properties as Record<string, unknown>,
      GEOJSON_RESULT.geometry,
    );
    expect(street).not.toBeNull();
    expect(street?.label).toBe("Vy-d'Avenches");
    expect(street?.esid).toBe(10061353);
    expect(street?.official).toBe(true);
    expect(street?.lines).toHaveLength(1);
  });

  it("returns null without a label", () => {
    expect(parseAttributes({ str_esid: 1 })).toBeNull();
  });
});

describe("extractLines", () => {
  it("handles MultiLineString", () => {
    expect(extractLines(GEOJSON_RESULT.geometry)).toHaveLength(1);
  });

  it("flattens GeometryCollection of MultiLineStrings", () => {
    const lines = extractLines({
      type: "GeometryCollection",
      geometries: [GEOJSON_RESULT.geometry, GEOJSON_RESULT.geometry],
    });
    expect(lines).toHaveLength(2);
  });

  it("drops polygons (named areas)", () => {
    expect(extractLines({ type: "MultiPolygon", coordinates: [] })).toBeNull();
  });
});

// Guard against response-shape drift: hits the real API once. Network-gated.
describe("identify integration (real API)", () => {
  it("parses at least one street with geometry from the Avenches tile", async () => {
    let streets;
    try {
      streets = await fetchOfficialStreets([7.03, 46.87, 7.05, 46.89], undefined, new RateLimiter());
    } catch {
      console.warn("[integration] network unavailable, skipping");
      return;
    }
    expect(streets.length).toBeGreaterThan(10);
    const guerite = streets.find((s) => s.label === "Route de la Guérite");
    expect(guerite).toBeDefined();
    expect(guerite?.lines?.length).toBeGreaterThan(0);
  }, 30_000);
});
