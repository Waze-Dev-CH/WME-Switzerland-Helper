import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ActivationContext, setCheckerEnabled } from "./activation";
import { SettingsStore } from "./settings";

describe("setCheckerEnabled", () => {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

  let ctx: ActivationContext;
  let settings: SettingsStore;
  let calls: string[];

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", localStorageStub);
    calls = [];
    settings = new SettingsStore(null);
    ctx = {
      settings,
      scanner: {
        setPaused: (paused: boolean) => calls.push(`setPaused(${paused})`),
        disable: () => calls.push("disable()"),
      },
      layer: { setVisible: (visible: boolean) => calls.push(`setVisible(${visible})`) },
      syncCheckbox: (checked: boolean) => calls.push(`syncCheckbox(${checked})`),
      syncToggle: (checked: boolean) => calls.push(`syncToggle(${checked})`),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists the choice so a reload restores it", () => {
    setCheckerEnabled(ctx, false, "checkbox");
    expect(settings.get().enabled).toBe(false);

    // The reload path: a fresh store reads back what the toggle wrote, which is what
    // registerLayerCheckbox now uses as the checkbox's initial state.
    expect(new SettingsStore(null).get().enabled).toBe(false);
  });

  it("hides the layer and empties the list when switched off", () => {
    setCheckerEnabled(ctx, false, "checkbox");
    expect(calls).toEqual(["setVisible(false)", "syncToggle(false)", "disable()"]);
  });

  it("shows the layer and resumes scanning when switched on", () => {
    setCheckerEnabled(ctx, false, "checkbox");
    calls = [];
    setCheckerEnabled(ctx, true, "checkbox");
    expect(settings.get().enabled).toBe(true);
    expect(calls).toEqual(["setVisible(true)", "syncToggle(true)", "setPaused(false)"]);
  });

  it("realigns the checkbox when the tab is the source", () => {
    setCheckerEnabled(ctx, false, "tab");
    expect(calls).toContain("syncCheckbox(false)");
    expect(calls.some((c) => c.startsWith("syncToggle"))).toBe(false);
  });

  it("realigns the tab toggle when the checkbox is the source", () => {
    // Otherwise the toggle still reads "on" and its next click sets what is already set.
    setCheckerEnabled(ctx, false, "checkbox");
    expect(calls).toContain("syncToggle(false)");
  });

  it("does not write the checkbox back when the checkbox is the source", () => {
    // Rewriting it would be redundant, and a loop if the SDK echoed the change back.
    setCheckerEnabled(ctx, false, "checkbox");
    expect(calls.some((c) => c.startsWith("syncCheckbox"))).toBe(false);
  });

  it("keeps both controls on the same persisted value across sources", () => {
    setCheckerEnabled(ctx, false, "tab");
    expect(settings.get().enabled).toBe(false);
    setCheckerEnabled(ctx, true, "checkbox");
    expect(settings.get().enabled).toBe(true);
    setCheckerEnabled(ctx, false, "tab");
    expect(settings.get().enabled).toBe(false);
  });

  it("leaves the other settings untouched", () => {
    settings.update({ minZoom: 17, ignoredKeys: ["1 NOT_FOUND x"] });
    setCheckerEnabled(ctx, false, "checkbox");
    expect(settings.get().minZoom).toBe(17);
    expect(settings.get().ignoredKeys).toEqual(["1 NOT_FOUND x"]);
  });
});
