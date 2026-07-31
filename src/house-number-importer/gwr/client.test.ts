import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../geoadmin/http";
import { fetchGwrPoints } from "./client";

const BBOX: [number, number, number, number] = [6.625, 46.51, 6.63, 46.515];

/** One `identify` result, trimmed to the fields the parser reads. */
function result(index: number) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [6.6 + index / 100000, 46.5] },
    properties: {
      egid: `9990${index}`,
      edid: "0",
      esid: 10000001,
      deinr: String(index + 1),
      strname: ["Rue Exemple"],
      gstat: 1004,
      doffadr: 1,
    },
  };
}

/** Serve `pageSizes[n]` results for offset n*200, like the paged identify endpoint. */
function stubIdentify(pageSizes: number[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const page = Number(new URL(url).searchParams.get("offset")) / 200;
      const count = pageSizes[page] ?? 0;
      const results = Array.from({ length: count }, (_, i) => result(page * 200 + i));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results }) });
    }),
  );
}

describe("fetchGwrPoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stops on the first short page and reports complete data", async () => {
    stubIdentify([200, 30]);
    const { points, truncated } = await fetchGwrPoints(BBOX, undefined, new RateLimiter());
    expect(points).toHaveLength(230);
    expect(truncated).toBe(false);
  });

  it("reads a single short page without asking for a second", async () => {
    stubIdentify([12]);
    const { points, truncated } = await fetchGwrPoints(BBOX, undefined, new RateLimiter());
    expect(points).toHaveLength(12);
    expect(truncated).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports truncation when the page cap is reached", async () => {
    // The reference userscript sent no paging and lost the overflow in silence; surfacing
    // it is what lets the UI hide a "N missing" count it cannot vouch for.
    stubIdentify(Array.from({ length: 12 }, () => 200));
    const { truncated } = await fetchGwrPoints(BBOX, undefined, new RateLimiter());
    expect(truncated).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it("requests the layer, projection and paging the parser expects", async () => {
    stubIdentify([1]);
    await fetchGwrPoints(BBOX, undefined, new RateLimiter());
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url.searchParams.get("layers")).toBe("all:ch.bfs.gebaeude_wohnungs_register");
    // WGS84 straight through: the SDK speaks it, so no projection maths is needed.
    expect(url.searchParams.get("sr")).toBe("4326");
    expect(url.searchParams.get("geometryFormat")).toBe("geojson");
    expect(url.searchParams.get("limit")).toBe("200");
  });

  it("drops unusable entries without dropping the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                result(0),
                { ...result(1), properties: { ...result(1).properties, deinr: "15.1" } },
                { ...result(2), properties: { ...result(2).properties, gstat: 1002 } },
              ],
            }),
        }),
      ),
    );
    const { points } = await fetchGwrPoints(BBOX, undefined, new RateLimiter());
    expect(points).toHaveLength(1);
  });

  it("rejects with AbortError once the signal fires", async () => {
    stubIdentify([1]);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchGwrPoints(BBOX, controller.signal, new RateLimiter())).rejects.toThrow(
      /abort/i,
    );
  });
});
