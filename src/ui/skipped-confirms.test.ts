import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSkipped,
  hasSkipped,
  isConfirmSkipped,
  rememberSkip,
  skipOption,
  syncResetButton,
} from "./skipped-confirms";
import { installFakeDocument, type FakeNode } from "./fake-dom";

const KEY = "wme-ch-helper.skipped-confirms";

describe("skipped confirmations", () => {
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

  it("remembers one id and leaves the others alone", () => {
    rememberSkip("chk.ignoreAll");
    expect(isConfirmSkipped("chk.ignoreAll")).toBe(true);
    expect(isConfirmSkipped("scu.closeOnly")).toBe(false);
  });

  it("clears one scope and keeps the others", () => {
    rememberSkip("chk.ignoreAll");
    rememberSkip("scu.closeOnly");
    expect(hasSkipped("chk")).toBe(true);

    clearSkipped("chk");

    expect(isConfirmSkipped("chk.ignoreAll")).toBe(false);
    expect(isConfirmSkipped("scu.closeOnly")).toBe(true);
    expect(hasSkipped("chk")).toBe(false);
    expect(hasSkipped("scu")).toBe(true);
  });

  it("stores an id once however often it is remembered", () => {
    rememberSkip("pt.deleteObsolete");
    rememberSkip("pt.deleteObsolete");
    expect(JSON.parse(store.get(KEY) ?? "[]")).toEqual(["pt.deleteObsolete"]);
  });

  it("treats an unreadable value as an empty list and recovers on the next remember", () => {
    for (const bad of ["{not json", "42", '"chk.ignoreAll"', "null"]) {
      store.set(KEY, bad);
      expect(isConfirmSkipped("chk.ignoreAll")).toBe(false);
      expect(hasSkipped("chk")).toBe(false);
    }

    store.set(KEY, "{not json");
    rememberSkip("chk.ignoreAll");
    expect(isConfirmSkipped("chk.ignoreAll")).toBe(true);
  });

  it("ignores non-string entries in the stored array", () => {
    store.set(KEY, JSON.stringify([7, null, "scu.closeStale"]));
    expect(isConfirmSkipped("scu.closeStale")).toBe(true);
    expect(hasSkipped("scu")).toBe(true);
  });

  it("reads the store on every call, so a change in another tab is seen", () => {
    expect(isConfirmSkipped("chk.ignoreAll")).toBe(false);
    store.set(KEY, JSON.stringify(["chk.ignoreAll"]));
    expect(isConfirmSkipped("chk.ignoreAll")).toBe(true);
  });

  it("reads isSkipped when the option is built and remember writes later", () => {
    const option = skipOption("scu.closeOnly", "Don't ask again");
    expect(option.label).toBe("Don't ask again");
    expect(option.isSkipped).toBe(false);

    option.remember();

    expect(isConfirmSkipped("scu.closeOnly")).toBe(true);
    expect(skipOption("scu.closeOnly", "x").isSkipped).toBe(true);
  });
});

describe("skipped confirmations without working storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers empty and never throws when localStorage is missing", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => rememberSkip("chk.ignoreAll")).not.toThrow();
    expect(isConfirmSkipped("chk.ignoreAll")).toBe(false);
    expect(hasSkipped("chk")).toBe(false);
    expect(() => clearSkipped("chk")).not.toThrow();
    expect(skipOption("chk.ignoreAll", "x").isSkipped).toBe(false);
  });

  it("answers empty and never throws when storage access throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => rememberSkip("chk.ignoreAll")).not.toThrow();
    expect(isConfirmSkipped("chk.ignoreAll")).toBe(false);
    expect(hasSkipped("chk")).toBe(false);
    expect(() => clearSkipped("chk")).not.toThrow();
  });
});

// The button is built once and the popups write later: the editor must find it enabled
// when they come back to it, whichever way they come.
describe("syncResetButton", () => {
  const store = new Map<string, string>();
  let restore: () => void;
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    restore = installFakeDocument();
  });
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  function setup() {
    const button = document.createElement("button");
    const region = document.createElement("div");
    syncResetButton(button, "pt", region);
    return { button, region: region as unknown as FakeNode };
  }

  it("starts disabled when nothing of its scope is skipped", () => {
    rememberSkip("chk.ignoreAll");
    expect(setup().button.disabled).toBe(true);
  });

  it("enables itself when the editor reaches it after a skip was chosen", () => {
    const { button, region } = setup();
    rememberSkip("pt.deleteObsolete");

    region.dispatch("pointerenter");

    expect(button.disabled).toBe(false);
  });

  it("also refreshes on keyboard focus", () => {
    const { button, region } = setup();
    rememberSkip("pt.deleteObsolete");

    region.dispatch("focusin");

    expect(button.disabled).toBe(false);
  });
});
