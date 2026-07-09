import { fetchOfficialStreets, type FetchStreetsResult } from "./client";
import type { TileStoreLike } from "./idb-store";
import { log } from "../log";
import type { Bbox, OfficialStreet } from "./types";

/** ~1.6 x 2.2 km at Swiss latitudes; a viewport at working zoom spans a few tiles. */
export const TILE_SIZE_DEG = 0.02;
// Tiles now carry geometries (~5-10x heavier); cap accordingly (~400 km² coverage).
const CACHE_MAX_TILES = 120;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // register is refreshed daily

export function tileKeysForBbox(bbox: Bbox): string[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const x0 = Math.floor(minLon / TILE_SIZE_DEG);
  const x1 = Math.floor(maxLon / TILE_SIZE_DEG);
  const y0 = Math.floor(minLat / TILE_SIZE_DEG);
  const y1 = Math.floor(maxLat / TILE_SIZE_DEG);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

export function tileKeyForPoint(lon: number, lat: number): string {
  return `${Math.floor(lon / TILE_SIZE_DEG)}:${Math.floor(lat / TILE_SIZE_DEG)}`;
}

export function tileKeyToBbox(key: string): Bbox {
  const [xs, ys] = key.split(":");
  const x = Number(xs);
  const y = Number(ys);
  return [
    x * TILE_SIZE_DEG,
    y * TILE_SIZE_DEG,
    (x + 1) * TILE_SIZE_DEG,
    (y + 1) * TILE_SIZE_DEG,
  ];
}

export interface CachedTile {
  entries: OfficialStreet[];
  /** The register fetch hit the page cap: entries are incomplete for this tile. */
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
  set(key: string, entries: OfficialStreet[], truncated = false, fetchedAt = this.now()): void {
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

export type FetchTileFn = (bbox: Bbox, signal?: AbortSignal) => Promise<FetchStreetsResult>;

export interface FetchTilesResult {
  streets: OfficialStreet[];
  /** Tiles whose register data was cut at the page cap (possible false NOT_FOUND). */
  truncatedKeys: string[];
  /** Tiles that failed to load (network error); their segments must be skipped. */
  failedKeys: string[];
}

interface TileResult extends CachedTile {
  failed: boolean;
}

export class TileFetcher {
  constructor(
    readonly cache = new TileCache(),
    private fetchTile: FetchTileFn = fetchOfficialStreets,
    private persistent: TileStoreLike | null = null,
  ) {
    void this.persistent?.prune(CACHE_TTL_MS);
  }

  /**
   * Resolve all official streets covering the bbox, tile by tile
   * (memory cache, then persistent store, then network),
   * deduplicated by federal street id.
   */
  async fetchBbox(
    bbox: Bbox,
    signal?: AbortSignal,
    onProgress?: (done: number, total: number) => void,
  ): Promise<FetchTilesResult> {
    return this.fetchTiles(tileKeysForBbox(bbox), signal, onProgress);
  }

  /** Same as fetchBbox for an explicit tile-key list (progressive area sweep). */
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
    const byEsid = new Map<number, OfficialStreet>();
    const truncatedKeys: string[] = [];
    const failedKeys: string[] = [];
    for (const tile of perTile) {
      for (const e of tile.entries) byEsid.set(e.esid, e);
      if (tile.truncated) truncatedKeys.push(tile.key);
      if (tile.failed) failedKeys.push(tile.key);
    }
    return { streets: [...byEsid.values()], truncatedKeys, failedKeys };
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
      const { streets, truncated } = await this.fetchTile(tileKeyToBbox(key), signal);
      this.cache.set(key, streets, truncated);
      void this.persistent?.set({ key, entries: streets, truncated, fetchedAt: Date.now() });
      return { entries: streets, truncated, failed: false };
    } catch (err) {
      // Abort keeps its meaning (scan superseded / cancelled). Any other error is
      // reported as a failed tile so one flaky request no longer kills the whole
      // scan; the failure is not cached, so the next scan retries the tile.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      log.warn(`Tile ${key} failed to load; its segments will be skipped`, err);
      return { entries: [], truncated: false, failed: true };
    }
  }

  /** Used by Rescan: drop both cache levels. */
  clearAll(): void {
    this.cache.clear();
    void this.persistent?.clear();
  }
}
