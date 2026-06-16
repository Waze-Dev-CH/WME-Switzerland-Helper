import { log } from "../log";
import type { OfficialStreet } from "./types";

const DB_NAME = "wme-ch-name-check";
const STORE_NAME = "tiles";
const MAX_PERSISTED_TILES = 2000;

export interface PersistedTile {
  key: string;
  entries: OfficialStreet[];
  fetchedAt: number;
}

export interface TileStoreLike {
  get(key: string): Promise<PersistedTile | undefined>;
  set(tile: PersistedTile): Promise<void>;
  clear(): Promise<void>;
  prune(ttlMs: number): Promise<void>;
}

/**
 * Tiny IndexedDB key-value store for fetched tiles, so a WME reload does not
 * refetch areas scanned in the last 24 h. Degrades silently to a no-op when
 * IndexedDB is unavailable (private browsing, storage pressure).
 */
export class IdbTileStore implements TileStoreLike {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private broken = false;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        // v2: drops tiles persisted by 1.1.0, which stored empty entry lists
        // because of the geojson attributes/properties parsing regression.
        const request = indexedDB.open(DB_NAME, 2);
        request.onupgradeneeded = () => {
          if (request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.deleteObjectStore(STORE_NAME);
          }
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
      });
    }
    return this.dbPromise;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | undefined> {
    if (this.broken) return undefined;
    try {
      const db = await this.open();
      return await new Promise<T>((resolve, reject) => {
        const request = operation(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      });
    } catch (err) {
      if (!this.broken) {
        this.broken = true;
        log.warn("IndexedDB unavailable; falling back to in-memory tile cache only", err);
      }
      return undefined;
    }
  }

  async get(key: string): Promise<PersistedTile | undefined> {
    return this.run("readonly", (store) => store.get(key) as IDBRequest<PersistedTile | undefined>);
  }

  async set(tile: PersistedTile): Promise<void> {
    await this.run("readwrite", (store) => store.put(tile));
  }

  async clear(): Promise<void> {
    await this.run("readwrite", (store) => store.clear());
  }

  /** Drop expired tiles, then the oldest beyond the cap. */
  async prune(ttlMs: number): Promise<void> {
    const all = await this.run("readonly", (store) => store.getAll() as IDBRequest<PersistedTile[]>);
    if (!all) return;
    const now = Date.now();
    const expired = all.filter((tile) => now - tile.fetchedAt > ttlMs).map((tile) => tile.key);
    const alive = all
      .filter((tile) => now - tile.fetchedAt <= ttlMs)
      .sort((a, b) => a.fetchedAt - b.fetchedAt);
    const overflow = alive.slice(0, Math.max(0, alive.length - MAX_PERSISTED_TILES));
    for (const key of [...expired, ...overflow.map((tile) => tile.key)]) {
      await this.run("readwrite", (store) => store.delete(key));
    }
  }
}
