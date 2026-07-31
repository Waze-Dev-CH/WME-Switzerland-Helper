import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../geoadmin/http";
import {
  extractLines,
  fetchOfficialStreets,
  findStreetLinesByName,
  parseAttributes,
} from "../geoadmin/client";

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

describe("fetchOfficialStreets truncation", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubIdentify(pageSizes: number[]): void {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const page = Number(new URL(url).searchParams.get("offset")) / 200;
        const count = pageSizes[page] ?? 0;
        const results = Array.from({ length: count }, (_, i) => ({
          properties: { ...GEOJSON_RESULT.properties, str_esid: page * 200 + i + 1 },
          geometry: GEOJSON_RESULT.geometry,
        }));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results }) });
      }),
    );
  }

  it("reports truncated=false when a short page ends the paging", async () => {
    stubIdentify([200, 5]);
    const result = await fetchOfficialStreets([7.03, 46.87, 7.05, 46.89], undefined, new RateLimiter());
    expect(result.truncated).toBe(false);
    expect(result.streets).toHaveLength(205);
  });

  it("reports truncated=true when the page cap is exhausted", async () => {
    stubIdentify(Array.from({ length: 15 }, () => 200)); // 15 full pages, cap reached
    const result = await fetchOfficialStreets([7.03, 46.87, 7.05, 46.89], undefined, new RateLimiter());
    expect(result.truncated).toBe(true);
    expect(result.streets).toHaveLength(15 * 200);
  });
});

describe("findStreetLinesByName pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages with offset/limit and aggregates lines until a short page", async () => {
    const oneLine = { type: "MultiLineString", coordinates: [[[6.6, 46.5], [6.61, 46.51]]] };
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        urls.push(url);
        const offset = Number(new URL(url).searchParams.get("offset"));
        const count = offset === 0 ? 200 : 5; // full first page, short second page
        const results = Array.from({ length: count }, () => ({ geometry: oneLine }));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results }) });
      }),
    );

    const lines = await findStreetLinesByName("Route de Berne", undefined, new RateLimiter());

    expect(lines).toHaveLength(205); // 200 + 5
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("offset=0");
    expect(urls[0]).toContain("limit=200");
    expect(urls[1]).toContain("offset=200");
  });
});

/**
 * A dead network and a changed API are not the same event, and the previous version of
 * this block caught both and returned: a response-shape drift makes fetchOfficialStreets
 * throw, so the one test meant to catch it passed in silence. Only transport failures are
 * skipped now; anything else fails the suite.
 */
export function isTransportFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Node wraps DNS and connection failures as "fetch failed" with a cause attached.
  if (err.message === "fetch failed") return true;
  // Our own wrappers. 5xx is the server having a bad day; a 4xx means the endpoint or
  // its parameters moved, which is exactly the drift this test exists to catch.
  return /geo\.admin\.ch HTTP 5\d\d|network error|timeout/.test(err.message);
}

describe("isTransportFailure", () => {
  it("skips only on transport failures", () => {
    expect(isTransportFailure(new Error("fetch failed"))).toBe(true);
    expect(isTransportFailure(new Error("geo.admin.ch HTTP 503"))).toBe(true);
    expect(isTransportFailure(new Error("GM_xmlhttpRequest network error"))).toBe(true);
    expect(isTransportFailure(new Error("GM_xmlhttpRequest timeout"))).toBe(true);
  });

  it("fails the suite on anything that smells like drift", () => {
    // A moved endpoint or changed parameters.
    expect(isTransportFailure(new Error("geo.admin.ch HTTP 404"))).toBe(false);
    expect(isTransportFailure(new Error("geo.admin.ch HTTP 400"))).toBe(false);
    // A renamed field: the exact case the old catch-all swallowed.
    expect(isTransportFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isTransportFailure("boom")).toBe(false);
  });
});

// Read off globalThis: the repo has no @types/node, and pulling one in for a single
// env lookup is not worth the dependency.
const integrationEnabled =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.WME_CH_INTEGRATION === "1";

// Hits the real API. Kept out of the default suite so `npm test` stays hermetic and fast:
//   WME_CH_INTEGRATION=1 npx vitest run src/street-name-checker/geoadmin/client.test.ts
describe.runIf(integrationEnabled)("identify integration (real API)", () => {
  it("parses streets with geometry from the Avenches tile", async () => {
    let streets: Awaited<ReturnType<typeof fetchOfficialStreets>>["streets"];
    try {
      ({ streets } = await fetchOfficialStreets(
        [7.03, 46.87, 7.05, 46.89],
        undefined,
        new RateLimiter(),
      ));
    } catch (err) {
      if (isTransportFailure(err)) {
        console.warn("[integration] network unavailable, skipping", err);
        return;
      }
      throw err;
    }

    expect(streets.length).toBeGreaterThan(10);
    // The shape assertions, not the sample: every street must carry a usable label and
    // parsed geometry, which is what the scanner relies on.
    for (const street of streets) {
      expect(typeof street.label).toBe("string");
      expect(street.label.length).toBeGreaterThan(0);
    }
    expect(streets.some((s) => (s.lines?.length ?? 0) > 0)).toBe(true);

    // Data sanity on a stable sample. If swisstopo ever renames it this fails loudly,
    // which is the intended outcome: someone should look.
    const guerite = streets.find((s) => s.label === "Route de la Guérite");
    expect(guerite, "Route de la Guérite missing from the Avenches bbox").toBeDefined();
    expect(guerite?.lines?.length).toBeGreaterThan(0);
  }, 30_000);
});
