import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_STATUSES,
  DEFAULT_SETTINGS,
  defaultEnabledStatuses,
  LOCK_DEFAULT_MIN_RANK,
  loadSettings,
  migrateSettings,
} from "./settings";

describe("migrateSettings", () => {
  it("returns defaults for unknown versions", () => {
    expect(migrateSettings({ version: 99 })).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps v2 settings as-is, completed with defaults", () => {
    const migrated = migrateSettings({ version: 2, minZoom: 17 });
    expect(migrated.minZoom).toBe(17);
    expect(migrated.enabledStatuses).toEqual(DEFAULT_SETTINGS.enabledStatuses);
  });

  it("migrates v1 with showCosmetic=false to a grid without COSMETIC", () => {
    const migrated = migrateSettings({ version: 1, showCosmetic: false } as never);
    expect(migrated.version).toBe(2);
    expect(migrated.enabledStatuses).not.toContain("COSMETIC");
    expect(migrated.enabledStatuses).toContain("VARIANT");
  });

  it("migrates v1 with showCosmetic=true to the full grid", () => {
    const migrated = migrateSettings({ version: 1, showCosmetic: true, minZoom: 16 } as never);
    expect(migrated.enabledStatuses).toEqual(ALL_STATUSES);
    expect(migrated.minZoom).toBe(16);
  });

  it("defaults editableOnly to false for v2 blobs without the field", () => {
    expect(DEFAULT_SETTINGS.editableOnly).toBe(false);
    expect(migrateSettings({ version: 2 }).editableOnly).toBe(false);
  });

  it("defaults ignoredKeys to an empty array and preserves stored ones", () => {
    expect(DEFAULT_SETTINGS.ignoredKeys).toEqual([]);
    expect(migrateSettings({ version: 2 }).ignoredKeys).toEqual([]);
    expect(migrateSettings({ version: 2, ignoredKeys: ["1 NOT_FOUND x"] }).ignoredKeys).toEqual([
      "1 NOT_FOUND x",
    ]);
  });
});

describe("ALL_STATUSES", () => {
  it("includes the lock-level checks", () => {
    expect(ALL_STATUSES).toContain("UNDER_LOCK");
    expect(ALL_STATUSES).toContain("OVER_LOCK");
  });

  it("includes UNNAMED_NO_MATCH but hides it by default", () => {
    expect(ALL_STATUSES).toContain("UNNAMED_NO_MATCH");
    expect(DEFAULT_SETTINGS.enabledStatuses).not.toContain("UNNAMED_NO_MATCH");
    expect(DEFAULT_SETTINGS.enabledStatuses).toContain("UNNAMED");
  });
});

describe("defaultEnabledStatuses (lock categories gated on editor rank)", () => {
  it("excludes the lock checks when the rank is unknown", () => {
    const s = defaultEnabledStatuses(null);
    expect(s).not.toContain("UNDER_LOCK");
    expect(s).not.toContain("OVER_LOCK");
  });

  it("excludes the lock checks below the rank threshold", () => {
    const s = defaultEnabledStatuses(LOCK_DEFAULT_MIN_RANK - 1);
    expect(s).not.toContain("UNDER_LOCK");
    expect(s).not.toContain("OVER_LOCK");
  });

  it("includes the lock checks at or above the rank threshold", () => {
    const s = defaultEnabledStatuses(LOCK_DEFAULT_MIN_RANK);
    expect(s).toContain("UNDER_LOCK");
    expect(s).toContain("OVER_LOCK");
  });

  it("always hides UNNAMED_NO_MATCH regardless of rank", () => {
    expect(defaultEnabledStatuses(null)).not.toContain("UNNAMED_NO_MATCH");
    expect(defaultEnabledStatuses(6)).not.toContain("UNNAMED_NO_MATCH");
  });

  it("matches the static default for ranks at or above the threshold", () => {
    expect(defaultEnabledStatuses(LOCK_DEFAULT_MIN_RANK)).toEqual(DEFAULT_SETTINGS.enabledStatuses);
  });
});

describe("loadSettings", () => {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gates the lock categories on the editor rank on first run", () => {
    expect(loadSettings(LOCK_DEFAULT_MIN_RANK - 1).enabledStatuses).not.toContain("UNDER_LOCK");
    expect(loadSettings(LOCK_DEFAULT_MIN_RANK).enabledStatuses).toContain("UNDER_LOCK");
  });

  it("respects stored settings and ignores the rank", () => {
    store.set(
      "wme-ch-name-check.settings",
      JSON.stringify({ version: 2, enabledStatuses: ["UNDER_LOCK"] }),
    );
    // rank below threshold, but the stored choice wins
    expect(loadSettings(0).enabledStatuses).toEqual(["UNDER_LOCK"]);
  });
});
