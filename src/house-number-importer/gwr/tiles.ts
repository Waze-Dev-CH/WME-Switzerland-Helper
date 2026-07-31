import { IdbTileStore, type TileStoreLike } from "../../geoadmin/idb-store";
import type { Bbox } from "../../geoadmin/types";
import { log } from "../log";
import { fetchGwrPoints, type FetchGwrResult } from "./client";
import type { GwrPoint } from "./types";

/**
 * ~380 x 555 m at Swiss latitudes, four times finer than the street-name checker's grid.
 * The register of streets is sparse; the building register is not. Measured at the densest
 * point of central Zurich: a 0.02° tile holds 4549 addresses (23 pages, past any sane cap),
 * a 0.01° tile 884, and a 0.005° tile 166. Small tiles also keep panning cheap, since only
 * the newly exposed strip has to be fetched.
 */
export const GWR_TILE_SIZE_DEG = 0.005;
const CACHE_MAX_TILES = 400;
/** House numbers change on a monthly scale; a long TTL spares a whole week of refetching. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const GWR_DB_NAME = "wme-ch-hn-import";
const GWR_STORE_NAME = "gwr-tiles";

export function createGwrTileStore(): TileStoreLike<GwrPoint> {
  return new IdbTileStore<GwrPoint>({
    dbName: GWR_DB_NAME,
    storeName: GWR_STORE_NAME,
    version: 1,
    maxRecords: 4000,
  });
}

export function tileKeysForBbox(bbox: Bbox): string[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const x0 = Math.floor(minLon / GWR_TILE_SIZE_DEG);
  const x1 = Math.floor(maxLon / GWR_TILE_SIZE_DEG);
  const y0 = Math.floor(minLat / GWR_TILE_SIZE_DEG);
  const y1 = Math.floor(maxLat / GWR_TILE_SIZE_DEG);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

export function tileKeyToBbox(key: string): Bbox {
  const [xs, ys] = key.split(":");
  const x = Number(xs);
  const y = Number(ys);
  return [
    x * GWR_TILE_SIZE_DEG,
    y * GWR_TILE_SIZE_DEG,
    (x + 1) * GWR_TILE_SIZE_DEG,
    (y + 1) * GWR_TILE_SIZE_DEG,
  ];
}

export interface CachedTile {
  entries: GwrPoint[];
  /** The fetch hit the page cap: addresses are missing for this tile. */
  truncated: boolean;
}

interface CacheSlot extends CachedTile {
  fetchedAt: number;
}

export class TileCache {
  private slots = new Map<string, CacheSlot>();

  constructor(
    private maxTiles = CACHE_MAX_TILES,
    private ttlMs = CACHE_TTL_MS,
    private now: () => number = Date.now,
  ) {}

  get(key: string): CachedTile | null {
    const slot = this.slots.get(key);
    if (!slot) return null;
    if (this.now() - slot.fetchedAt > this.ttlMs) {
      this.slots.delete(key);
      return null;
    }
    // LRU touch: re-insert to move to the end of iteration order
    this.slots.delete(key);
    this.slots.set(key, slot);
    return slot;
  }

  /** fetchedAt lets persisted tiles keep their original age (TTL coherence). */
  set(key: string, entries: GwrPoint[], truncated = false, fetchedAt = this.now()): void {
    this.slots.delete(key);
    this.slots.set(key, { entries, truncated, fetchedAt });
    while (this.slots.size > this.maxTiles) {
      const oldest = this.slots.keys().next().value;
      if (oldest === undefined) break;
      this.slots.delete(oldest);
    }
  }

  clear(): void {
    this.slots.clear();
  }
}

export type FetchTileFn = (bbox: Bbox, signal?: AbortSignal) => Promise<FetchGwrResult>;

export interface FetchTilesResult {
  points: GwrPoint[];
  /** Tiles cut at the page cap: their missing addresses would read as "not imported yet". */
  truncatedKeys: string[];
  /** Tiles that failed to load; nothing can be said about their addresses. */
  failedKeys: string[];
}

interface TileResult extends CachedTile {
  failed: boolean;
}

export class GwrTileFetcher {
  constructor(
    readonly cache = new TileCache(),
    private fetchTile: FetchTileFn = fetchGwrPoints,
    private persistent: TileStoreLike<GwrPoint> | null = null,
  ) {
    void this.persistent?.prune(CACHE_TTL_MS);
  }

  /** Resolve every address point covering the bbox: memory cache, then store, then network. */
  async fetchBbox(
    bbox: Bbox,
    signal?: AbortSignal,
    onProgress?: (done: number, total: number) => void,
  ): Promise<FetchTilesResult> {
    return this.fetchTiles(tileKeysForBbox(bbox), signal, onProgress);
  }

  async fetchTiles(
    keys: string[],
    signal?: AbortSignal,
    onProgress?: (done: number, total: number) => void,
  ): Promise<FetchTilesResult> {
    let done = 0;
    onProgress?.(0, keys.length);
    const perTile = await Promise.all(
      keys.map(async (key) => {
        const result = await this.resolveTile(key, signal);
        done++;
        onProgress?.(done, keys.length);
        return { key, ...result };
      }),
    );
    // Keyed by point id: a building sitting on a tile edge comes back from both tiles.
    const byId = new Map<string, GwrPoint>();
    const truncatedKeys: string[] = [];
    const failedKeys: string[] = [];
    for (const tile of perTile) {
      for (const point of tile.entries) byId.set(point.id, point);
      if (tile.truncated) truncatedKeys.push(tile.key);
      if (tile.failed) failedKeys.push(tile.key);
    }
    return { points: [...byId.values()], truncatedKeys, failedKeys };
  }

  private async resolveTile(key: string, signal?: AbortSignal): Promise<TileResult> {
    const cached = this.cache.get(key);
    if (cached) return { ...cached, failed: false };

    const persisted = await this.persistent?.get(key);
    if (persisted && Date.now() - persisted.fetchedAt <= CACHE_TTL_MS) {
      const truncated = persisted.truncated ?? false;
      this.cache.set(key, persisted.entries, truncated, persisted.fetchedAt);
      return { entries: persisted.entries, truncated, failed: false };
    }

    try {
      const { points, truncated } = await this.fetchTile(tileKeyToBbox(key), signal);
      this.cache.set(key, points, truncated);
      void this.persistent?.set({ key, entries: points, truncated, fetchedAt: Date.now() });
      return { entries: points, truncated, failed: false };
    } catch (err) {
      // Abort keeps its meaning (superseded / cancelled). Any other error is reported as a
      // failed tile so one flaky request does not kill the whole view; the failure is not
      // cached, so the next pass retries it.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      log.warn(`Tile ${key} failed to load; its addresses will be missing`, err);
      return { entries: [], truncated: false, failed: true };
    }
  }

  clearAll(): void {
    this.cache.clear();
    void this.persistent?.clear();
  }
}
