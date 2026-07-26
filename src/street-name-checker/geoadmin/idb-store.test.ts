import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdbTileStore, type PersistedTile } from "./idb-store";

/**
 * Minimal IndexedDB double. fake-indexeddb would mean a new devDependency, and this
 * store only touches open/upgrade, get, put, getAll, delete and clear. Requests fire
 * their handlers on a microtask because the code under test assigns them right after
 * the call returns, exactly like the real API.
 */
function makeIdb(options: { existingVersion?: number; records?: PersistedTile[] } = {}) {
  const calls: string[] = [];
  const data = new Map<string, PersistedTile>(
    (options.records ?? []).map((tile) => [tile.key, tile]),
  );
  let version = options.existingVersion ?? 0;
  let storeExists = version > 0;

  const settle = <T>(result: T) => {
    const request = { result, onsuccess: null, onerror: null } as unknown as {
      result: T;
      onsuccess: (() => void) | null;
    };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };

  const objectStore = {
    get: (key: string) => settle(data.get(key)),
    put: (tile: PersistedTile) => {
      data.set(tile.key, tile);
      return settle(undefined);
    },
    getAll: () => settle([...data.values()]),
    delete: (key: string) => {
      calls.push(`delete:${key}`);
      data.delete(key);
      return settle(undefined);
    },
    clear: () => {
      data.clear();
      return settle(undefined);
    },
  };

  const db = {
    objectStoreNames: { contains: (name: string) => name === "tiles" && storeExists },
    deleteObjectStore: (name: string) => {
      calls.push(`deleteObjectStore:${name}`);
      storeExists = false;
      // The real thing discards the records with the store; that is the whole point
      // of the v2 bump, so the double must do it too.
      data.clear();
    },
    createObjectStore: (name: string) => {
      calls.push(`createObjectStore:${name}`);
      storeExists = true;
      return objectStore;
    },
    transaction: () => ({ objectStore: () => objectStore }),
  };

  const indexedDB = {
    open: (_name: string, requested: number) => {
      const request = {
        result: db,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      } as unknown as {
        result: typeof db;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
      };
      queueMicrotask(() => {
        if (requested > version) {
          version = requested;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };

  return { indexedDB, calls, data };
}

const tile = (key: string, fetchedAt: number): PersistedTile => ({
  key,
  entries: [],
  fetchedAt,
  truncated: false,
});

describe("IdbTileStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  describe("round trip", () => {
    let idb: ReturnType<typeof makeIdb>;
    let store: IdbTileStore;

    beforeEach(() => {
      idb = makeIdb({ existingVersion: 2 });
      vi.stubGlobal("indexedDB", idb.indexedDB);
      store = new IdbTileStore();
    });

    it("stores and reads a tile back", async () => {
      await store.set(tile("46.52/6.63", 1_700_000_000_000));
      expect(await store.get("46.52/6.63")).toEqual(tile("46.52/6.63", 1_700_000_000_000));
    });

    it("returns undefined for an unknown key", async () => {
      expect(await store.get("nope")).toBeUndefined();
    });

    it("empties the store on clear", async () => {
      await store.set(tile("a", 1));
      await store.clear();
      expect(await store.get("a")).toBeUndefined();
    });
  });

  describe("prune", () => {
    it("drops tiles older than the TTL and keeps the rest", async () => {
      const now = Date.now();
      const idb = makeIdb({
        existingVersion: 2,
        records: [
          tile("fresh", now - 1_000),
          tile("stale", now - 48 * 3_600_000),
          tile("edge", now - 24 * 3_600_000),
        ],
      });
      vi.stubGlobal("indexedDB", idb.indexedDB);

      await new IdbTileStore().prune(24 * 3_600_000);

      expect([...idb.data.keys()]).toEqual(["fresh", "edge"]);
    });

    it("drops the oldest tiles beyond the 2000 cap", async () => {
      const now = Date.now();
      // 2001 live tiles: only the single oldest may go.
      const records = Array.from({ length: 2001 }, (_, i) => tile(`t${i}`, now - (2001 - i)));
      const idb = makeIdb({ existingVersion: 2, records });
      vi.stubGlobal("indexedDB", idb.indexedDB);

      await new IdbTileStore().prune(24 * 3_600_000);

      expect(idb.data.size).toBe(2000);
      expect(idb.data.has("t0")).toBe(false);
      expect(idb.data.has("t1")).toBe(true);
    });
  });

  describe("v1 to v2 migration", () => {
    it("drops the old object store, discarding tiles from the broken 1.1.0 release", async () => {
      const idb = makeIdb({
        existingVersion: 1,
        records: [tile("persisted-by-1.1.0", Date.now())],
      });
      vi.stubGlobal("indexedDB", idb.indexedDB);

      // Those records had empty entry lists from the attributes/properties parsing
      // regression; keeping them would serve empty tiles for a whole day.
      expect(await new IdbTileStore().get("persisted-by-1.1.0")).toBeUndefined();
      expect(idb.calls).toEqual(["deleteObjectStore:tiles", "createObjectStore:tiles"]);
    });

    it("only creates the store on a first run", async () => {
      const idb = makeIdb({ existingVersion: 0 });
      vi.stubGlobal("indexedDB", idb.indexedDB);

      await new IdbTileStore().get("anything");
      expect(idb.calls).toEqual(["createObjectStore:tiles"]);
    });
  });

  describe("degraded mode", () => {
    it("never throws when IndexedDB is unavailable", async () => {
      // Private browsing, storage pressure: the in-memory cache must carry on alone.
      vi.stubGlobal("indexedDB", undefined);
      const store = new IdbTileStore();

      await expect(store.set(tile("a", 1))).resolves.toBeUndefined();
      await expect(store.get("a")).resolves.toBeUndefined();
      await expect(store.clear()).resolves.toBeUndefined();
      await expect(store.prune(1000)).resolves.toBeUndefined();
    });

    it("warns once, not on every call", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const store = new IdbTileStore();

      await store.get("a");
      await store.get("b");
      await store.set(tile("c", 1));

      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});
