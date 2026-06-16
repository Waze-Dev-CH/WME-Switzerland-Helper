import { describe, expect, it } from "vitest";
import { TILE_SIZE_DEG, TileCache, TileFetcher, tileKeyForPoint, tileKeyToBbox, tileKeysForBbox } from "../geoadmin/tiles";
import type { Bbox } from "../geoadmin/types";
import type { PersistedTile, TileStoreLike } from "../geoadmin/idb-store";
import { makeOfficial } from "../fixtures/swiss-names";

class FakeStore implements TileStoreLike {
  map = new Map<string, PersistedTile>();
  pruned = 0;
  async get(key: string): Promise<PersistedTile | undefined> {
    return this.map.get(key);
  }
  async set(tile: PersistedTile): Promise<void> {
    this.map.set(tile.key, tile);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
  async prune(): Promise<void> {
    this.pruned++;
  }
}

describe("tileKeysForBbox", () => {
  it("returns a single tile for a tiny bbox", () => {
    const keys = tileKeysForBbox([6.631, 46.521, 6.632, 46.522]);
    expect(keys).toHaveLength(1);
  });

  it("covers a bbox spanning tile boundaries", () => {
    const keys = tileKeysForBbox([6.619, 46.519, 6.641, 46.541]);
    // spans 2 tile columns x 2 tile rows
    expect(keys.length).toBeGreaterThanOrEqual(4);
  });

  it("tileKeyForPoint matches the covering tile", () => {
    const keys = tileKeysForBbox([6.681, 46.628, 6.684, 46.633]);
    expect(keys).toContain(tileKeyForPoint(6.6828, 46.6303));
  });

  it("roundtrips with tileKeyToBbox", () => {
    const [key] = tileKeysForBbox([6.631, 46.521, 6.632, 46.522]);
    const bbox = tileKeyToBbox(key as string);
    expect(bbox[2] - bbox[0]).toBeCloseTo(TILE_SIZE_DEG);
    expect(bbox[3] - bbox[1]).toBeCloseTo(TILE_SIZE_DEG);
    expect(bbox[0]).toBeLessThanOrEqual(6.631);
    expect(bbox[2]).toBeGreaterThanOrEqual(6.632);
  });
});

describe("TileCache", () => {
  it("returns null for misses and expires entries after the TTL", () => {
    let now = 1_000_000;
    const cache = new TileCache(10, 1000, () => now);
    expect(cache.get("a")).toBeNull();
    cache.set("a", [makeOfficial("Rue A")]);
    expect(cache.get("a")).toHaveLength(1);
    now += 1001;
    expect(cache.get("a")).toBeNull();
  });

  it("evicts the least recently used tile beyond capacity", () => {
    const cache = new TileCache(2, 60_000, () => 0);
    cache.set("a", []);
    cache.set("b", []);
    cache.get("a"); // touch a -> b becomes LRU
    cache.set("c", []);
    expect(cache.get("a")).not.toBeNull();
    expect(cache.get("b")).toBeNull();
    expect(cache.get("c")).not.toBeNull();
  });
});

describe("TileFetcher", () => {
  it("fetches uncached tiles, uses the cache afterwards, and dedupes by esid", async () => {
    const shared = makeOfficial("Rue Partagée");
    let calls = 0;
    const fetcher = new TileFetcher(new TileCache(10, 60_000, () => 0), async () => {
      calls++;
      return [shared, makeOfficial(`Rue ${calls}`)];
    });
    const bbox: Bbox = [6.619, 46.519, 6.641, 46.541];
    const tiles = tileKeysForBbox(bbox).length;

    const first = await fetcher.fetchBbox(bbox);
    expect(calls).toBe(tiles);
    // one shared entry across all tiles + one unique per tile
    expect(first).toHaveLength(tiles + 1);

    await fetcher.fetchBbox(bbox);
    expect(calls).toBe(tiles); // all cached, no new fetches
  });

  it("reports progress", async () => {
    const fetcher = new TileFetcher(new TileCache(10, 60_000, () => 0), async () => []);
    const progress: Array<[number, number]> = [];
    await fetcher.fetchBbox([6.631, 46.521, 6.632, 46.522], undefined, (done, total) =>
      progress.push([done, total]),
    );
    expect(progress[0]).toEqual([0, 1]);
    expect(progress[progress.length - 1]).toEqual([1, 1]);
  });
});

describe("TileFetcher with a persistent store", () => {
  const bbox: Bbox = [6.631, 46.521, 6.632, 46.522]; // single tile

  it("prunes the store at construction", () => {
    const store = new FakeStore();
    new TileFetcher(new TileCache(10, 60_000, () => 0), async () => [], store);
    expect(store.pruned).toBe(1);
  });

  it("writes fetched tiles to the store and reads them back without network", async () => {
    const store = new FakeStore();
    let calls = 0;
    const fetcher = new TileFetcher(new TileCache(10, 60_000), async () => {
      calls++;
      return [makeOfficial("Rue Persistée")];
    }, store);
    await fetcher.fetchBbox(bbox);
    expect(calls).toBe(1);
    expect(store.map.size).toBe(1);

    // simulate a reload: fresh memory cache, same store
    const fetcher2 = new TileFetcher(new TileCache(10, 60_000), async () => {
      calls++;
      return [];
    }, store);
    const entries = await fetcher2.fetchBbox(bbox);
    expect(calls).toBe(1); // served from the persistent store
    expect(entries.map((e) => e.label)).toEqual(["Rue Persistée"]);
  });

  it("refetches when the persisted tile is older than the TTL", async () => {
    const store = new FakeStore();
    const keys = tileKeysForBbox(bbox);
    store.map.set(keys[0] as string, {
      key: keys[0] as string,
      entries: [makeOfficial("Rue Périmée")],
      fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
    });
    let calls = 0;
    const fetcher = new TileFetcher(new TileCache(10, 60_000), async () => {
      calls++;
      return [makeOfficial("Rue Fraîche")];
    }, store);
    const entries = await fetcher.fetchBbox(bbox);
    expect(calls).toBe(1);
    expect(entries.map((e) => e.label)).toEqual(["Rue Fraîche"]);
  });

  it("clearAll drops both levels", async () => {
    const store = new FakeStore();
    const fetcher = new TileFetcher(new TileCache(10, 60_000), async () => [makeOfficial("X")], store);
    await fetcher.fetchBbox(bbox);
    expect(store.map.size).toBe(1);
    fetcher.clearAll();
    expect(store.map.size).toBe(0);
  });
});
