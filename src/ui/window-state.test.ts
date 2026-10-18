import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { panelWindowStore, WINDOWS_KEY } from "./window-state";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("panelWindowStore", () => {
  it("starts docked, with no geometry", () => {
    const panel = panelWindowStore("ur-assistant");
    expect(panel.getMode()).toBe("sidebar");
    expect(panel.getRect()).toBeUndefined();
  });

  it("keeps each panel's mode and geometry apart, in one entry", () => {
    const urs = panelWindowStore("ur-assistant");
    const numbers = panelWindowStore("house-numbers");

    urs.setMode("floating");
    urs.setRect({ x: 1, y: 2, w: 400, h: 300 });
    numbers.setRect({ x: 9, y: 9, w: 500, h: 500 });

    expect(urs.getMode()).toBe("floating");
    expect(numbers.getMode()).toBe("sidebar");
    expect(urs.getRect()).toEqual({ x: 1, y: 2, w: 400, h: 300 });
    expect(JSON.parse(store.get(WINDOWS_KEY) ?? "{}")).toEqual({
      "ur-assistant": {
        mode: "floating",
        rect: { x: 1, y: 2, w: 400, h: 300 },
      },
      "house-numbers": { rect: { x: 9, y: 9, w: 500, h: 500 } },
    });
  });

  it("never opens a window from a damaged save", () => {
    store.set(WINDOWS_KEY, JSON.stringify({ "ur-assistant": { mode: "yes" } }));
    expect(panelWindowStore("ur-assistant").getMode()).toBe("sidebar");

    store.set(WINDOWS_KEY, "not json");
    expect(panelWindowStore("ur-assistant").getMode()).toBe("sidebar");
  });

  it("still works when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const panel = panelWindowStore("ur-assistant");

    expect(() => panel.setMode("floating")).not.toThrow();
    expect(panel.getMode()).toBe("sidebar");
  });
});
