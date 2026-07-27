/**
 * Tiny IndexedDB key-value store for fetched tiles, so a WME reload does not refetch areas
 * scanned recently. Degrades silently to a no-op when IndexedDB is unavailable (private
 * browsing, storage pressure).
 *
 * Generic over the entry type, and parameterized by database name, store name and version:
 * IndexedDB versions the DATABASE, not the object store, and `onupgradeneeded` below drops
 * the store to discard stale records. Two features sharing one database would therefore run
 * each other's upgrade handlers, so every feature owns its own database.
 */

export interface PersistedTile<T> {
  key: string;
  entries: T[];
  fetchedAt: number;
  /** Page cap hit when fetched; optional so pre-existing records read as complete. */
  truncated?: boolean;
}

export interface TileStoreLike<T> {
  get(key: string): Promise<PersistedTile<T> | undefined>;
  set(tile: PersistedTile<T>): Promise<void>;
  clear(): Promise<void>;
  prune(ttlMs: number): Promise<void>;
}

export interface IdbTileStoreOptions {
  dbName: string;
  storeName: string;
  /** Bump to discard every persisted tile: the upgrade drops and recreates the store. */
  version: number;
  maxRecords?: number;
}

const DEFAULT_MAX_RECORDS = 2000;

export class IdbTileStore<T> implements TileStoreLike<T> {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private broken = false;
  private readonly maxRecords: number;

  constructor(private options: IdbTileStoreOptions) {
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const { dbName, storeName, version } = this.options;
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = () => {
          // A tile cache is disposable: rather than migrating records whose shape changed,
          // drop them and let the next scan refetch.
          if (request.result.objectStoreNames.contains(storeName)) {
            request.result.deleteObjectStore(storeName);
          }
          request.result.createObjectStore(storeName, { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
      });
    }
    return this.dbPromise;
  }

  private async run<R>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R | undefined> {
    if (this.broken) return undefined;
    try {
      const db = await this.open();
      const { storeName } = this.options;
      return await new Promise<R>((resolve, reject) => {
        const request = operation(db.transaction(storeName, mode).objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      });
    } catch (err) {
      if (!this.broken) {
        this.broken = true;
        console.warn(
          `[${this.options.dbName}] IndexedDB unavailable; falling back to in-memory tile cache only`,
          err,
        );
      }
      return undefined;
    }
  }

  async get(key: string): Promise<PersistedTile<T> | undefined> {
    return this.run(
      "readonly",
      (store) => store.get(key) as IDBRequest<PersistedTile<T> | undefined>,
    );
  }

  async set(tile: PersistedTile<T>): Promise<void> {
    await this.run("readwrite", (store) => store.put(tile));
  }

  async clear(): Promise<void> {
    await this.run("readwrite", (store) => store.clear());
  }

  /** Drop expired tiles, then the oldest beyond the cap. */
  async prune(ttlMs: number): Promise<void> {
    const all = await this.run(
      "readonly",
      (store) => store.getAll() as IDBRequest<Array<PersistedTile<T>>>,
    );
    if (!all) return;
    const now = Date.now();
    const expired = all.filter((tile) => now - tile.fetchedAt > ttlMs).map((tile) => tile.key);
    const alive = all
      .filter((tile) => now - tile.fetchedAt <= ttlMs)
      .sort((a, b) => a.fetchedAt - b.fetchedAt);
    const overflow = alive.slice(0, Math.max(0, alive.length - this.maxRecords));
    for (const key of [...expired, ...overflow.map((tile) => tile.key)]) {
      await this.run("readwrite", (store) => store.delete(key));
    }
  }
}
