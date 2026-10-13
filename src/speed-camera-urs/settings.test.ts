import { describe, expect, it } from "vitest";
import {
  DEFAULT_CRITERIA,
  loadSettings,
  saveSettings,
  STORAGE_KEY,
  type SettingsStore,
} from "./settings";

function memoryStore(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  const store: SettingsStore = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  return { store, data };
}

const throwing: SettingsStore = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("loadSettings", () => {
  it("starts with speed cameras and traffic lights on, abandoned off", () => {
    expect(loadSettings(memoryStore().store)).toEqual({
      version: 1,
      criteria: { speedCamera: true, trafficLight: true, stale: false },
    });
    expect(DEFAULT_CRITERIA.stale).toBe(false);
  });

  it("merges a partial save with the defaults", () => {
    const { store } = memoryStore(
      JSON.stringify({ version: 1, criteria: { stale: true } }),
    );
    expect(loadSettings(store).criteria).toEqual({
      speedCamera: true,
      trafficLight: true,
      stale: true,
    });
  });

  it("keeps the default for any value that is not a boolean", () => {
    const { store } = memoryStore(
      JSON.stringify({ criteria: { stale: "yes", speedCamera: 0 } }),
    );
    expect(loadSettings(store).criteria).toEqual(DEFAULT_CRITERIA);
  });

  it("falls back to the defaults on unreadable or odd JSON", () => {
    for (const raw of ["{not json", "[]", '"x"', "null", "5"]) {
      expect(loadSettings(memoryStore(raw).store).criteria).toEqual(
        DEFAULT_CRITERIA,
      );
    }
  });

  it("falls back to the defaults when the storage throws or is missing", () => {
    expect(loadSettings(throwing).criteria).toEqual(DEFAULT_CRITERIA);
    expect(loadSettings(null).criteria).toEqual(DEFAULT_CRITERIA);
  });
});

describe("saveSettings", () => {
  it("round-trips through the store", () => {
    const { store, data } = memoryStore();
    const settings = {
      version: 1 as const,
      criteria: { speedCamera: false, trafficLight: true, stale: true },
    };
    saveSettings(settings, store);
    expect(JSON.parse(data.get(STORAGE_KEY) ?? "")).toEqual(settings);
    expect(loadSettings(store)).toEqual(settings);
  });

  it("does not throw when the storage does", () => {
    expect(() =>
      saveSettings({ version: 1, criteria: DEFAULT_CRITERIA }, throwing),
    ).not.toThrow();
  });
});
