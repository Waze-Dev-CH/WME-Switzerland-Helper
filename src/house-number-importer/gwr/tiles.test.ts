import { describe, expect, it, vi } from "vitest";
import type { PersistedTile, TileStoreLike } from "../../geoadmin/idb-store";
import type { Bbox } from "../../geoadmin/types";
import { GwrTileFetcher, TileCache, tileKeyToBbox, tileKeysForBbox } from "./tiles";
import type { GwrPoint } from "./types";

const point = (id: string, number = "15"): GwrPoint => ({
  id,
  number,
  streetNames: ["Rue Exemple"],
  esid: 10000001,
  lon: 6.6,
  lat: 46.5,
  officialAddress: true,
});

class FakeStore implements TileStoreLike<GwrPoint> {
  map = new Map<string, PersistedTile<GwrPoint>>();
  pruned: number | null = null;

  async get(key: string): Promise<PersistedTile<GwrPoint> | undefined> {
    return this.map.get(key);
  }
  async set(tile: PersistedTile<GwrPoint>): Promise<void> {
    this.map.set(tile.key, tile);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
  async prune(ttlMs: number): Promise<void> {
    this.pruned = ttlMs;
  }
}

describe("tile grid", () => {
  it("round-trips a key through its bbox", () => {
    const [key] = tileKeysForBbox([6.6301, 46.5201, 6.6302, 46.5202]);
    const [minLon, minLat, maxLon, maxLat] = tileKeyToBbox(key);
    expect(minLon).toBeLessThanOrEqual(6.6301);
    expect(minLat).toBeLessThanOrEqual(46.5201);
    expect(maxLon).toBeGreaterThanOrEqual(6.6302);
    expect(maxLat).toBeGreaterThanOrEqual(46.5202);
  });

  it("covers a bbox spanning several tiles", () => {
    // Bounds deliberately inside the tiles rather than on their edges: `6.6 / 0.005`
    // lands on 1320.0000000000002 in binary floating point, so a bbox ending exactly on
    // a boundary picks up the next tile or not depending on the rounding direction.
    const bbox: Bbox = [6.6012, 46.5012, 6.6137, 46.5063];
    expect(tileKeysForBbox(bbox)).toHaveLength(6); // 3 columns x 2 rows
  });

  it("keeps a working-zoom viewport down to a handful of tiles", () => {
    // ~600 m at z17 in Lausanne. Each tile is one request in practice: the densest 0.005°
    // tile measured in central Zurich holds 166 addresses, well under one 200-row page.
    const bbox: Bbox = [6.625, 46.518, 6.633, 46.524];
    expect(tileKeysForBbox(bbox).length).toBeLessThanOrEqual(12);
  });
});

describe("TileCache", () => {
  it("returns a fresh tile and drops an expired one", () => {
    let now = 1_000;
    const cache = new TileCache(10, 100, () => now);
    cache.set("a", [point("1")]);
    expect(cache.get("a")?.entries).toHaveLength(1);
    now += 101;
    expect(cache.get("a")).toBeNull();
  });

  it("evicts the least recently used tile beyond the cap", () => {
    const cache = new TileCache(2, 10_000, () => 0);
    cache.set("a", [point("1")]);
    cache.set("b", [point("2")]);
    cache.get("a"); // touch, so "b" becomes the eviction candidate
    cache.set("c", [point("3")]);
    expect(cache.get("a")).not.toBeNull();
    expect(cache.get("b")).toBeNull();
    expect(cache.get("c")).not.toBeNull();
  });

  it("honors the age a persisted tile was given", () => {
    const now = 10_000;
    const cache = new TileCache(10, 1_000, () => now);
    // Promoted from IndexedDB with its original timestamp: it is already stale.
    cache.set("a", [point("1")], false, now - 2_000);
    expect(cache.get("a")).toBeNull();
  });
});

describe("GwrTileFetcher", () => {
  it("fetches once and serves the memory cache afterwards", async () => {
    const fetchTile = vi.fn(async () => ({ points: [point("1")], truncated: false }));
    const fetcher = new GwrTileFetcher(new TileCache(), fetchTile);

    await fetcher.fetchTiles(["1320:9300"]);
    await fetcher.fetchTiles(["1320:9300"]);
    expect(fetchTile).toHaveBeenCalledTimes(1);
  });

  it("prefers a fresh persisted tile over the network", async () => {
    const store = new FakeStore();
    await store.set({
      key: "1320:9300",
      entries: [point("persisted")],
      fetchedAt: Date.now(),
      truncated: false,
    });
    const fetchTile = vi.fn(async () => ({ points: [point("network")], truncated: false }));

    const { points } = await new GwrTileFetcher(new TileCache(), fetchTile, store).fetchTiles([
      "1320:9300",
    ]);
    expect(points[0].id).toBe("persisted");
    expect(fetchTile).not.toHaveBeenCalled();
  });

  it("persists what it fetched, and prunes on construction", async () => {
    const store = new FakeStore();
    const fetchTile = vi.fn(async () => ({ points: [point("1")], truncated: false }));

    const fetcher = new GwrTileFetcher(new TileCache(), fetchTile, store);
    await fetcher.fetchTiles(["1320:9300"]);
    expect(store.map.get("1320:9300")?.entries).toHaveLength(1);
    expect(store.pruned).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("reports a truncated tile instead of pretending it is complete", async () => {
    const fetchTile = vi.fn(async () => ({ points: [point("1")], truncated: true }));
    const { truncatedKeys } = await new GwrTileFetcher(new TileCache(), fetchTile).fetchTiles([
      "1320:9300",
    ]);
    expect(truncatedKeys).toEqual(["1320:9300"]);
  });

  it("contains a failing tile instead of losing the whole view", async () => {
    // Tile 1320 starts at 6.600, tile 1321 at 6.605: the threshold sits between them
    // rather than on a boundary, so only the second tile fails.
    const fetchTile = vi.fn(async (bbox: Bbox) => {
      if (bbox[0] > 6.602) throw new Error("network");
      return { points: [point("1")], truncated: false };
    });
    const fetcher = new GwrTileFetcher(new TileCache(), fetchTile);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { points, failedKeys } = await fetcher.fetchTiles(["1320:9300", "1321:9300"]);
    expect(points).toHaveLength(1);
    expect(failedKeys).toHaveLength(1);
    warn.mockRestore();
  });

  it("lets an abort through, so a superseded pass really stops", async () => {
    const fetchTile = vi.fn(async () => {
      throw new DOMException("Fetch aborted", "AbortError");
    });
    const fetcher = new GwrTileFetcher(new TileCache(), fetchTile);
    await expect(fetcher.fetchTiles(["1320:9300"])).rejects.toThrow(/abort/i);
  });

  it("keeps one entry per point when tiles overlap on a building", async () => {
    const fetchTile = vi.fn(async () => ({ points: [point("shared")], truncated: false }));
    const { points } = await new GwrTileFetcher(new TileCache(), fetchTile).fetchTiles([
      "1320:9300",
      "1321:9300",
    ]);
    expect(points).toHaveLength(1);
  });
});
