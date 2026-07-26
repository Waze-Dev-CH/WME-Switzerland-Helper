import type { WmeSDK } from "wme-sdk-typings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TileFetcher } from "./geoadmin/tiles";
import type { Bbox } from "./geoadmin/types";
import { Scanner, type ScanSnapshot } from "./scan";
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from "./settings";

/** Debounce inside requestScan; tests drive it with fake timers. */
const DEBOUNCE_MS = 800;

// Areas below are the ones the scanner actually measures: padBbox widens the viewport
// by 20% on each side before the cap is applied, so a 0.02 degree square already lands
// at 6.6 km2 and would be gated.
/** ~2.4 km2 once padded: clears the 6 km2 auto-scan cap. */
const LAUSANNE: Bbox = [6.6, 46.5, 6.612, 46.512];
/** Same size, outside Switzerland. */
const PARIS: Bbox = [2.3, 48.85, 2.312, 48.862];
/** ~26.6 km2 once padded: over the auto-scan cap, under the 50 km2 sweep cap. */
const BROAD_CH: Bbox = [6.5, 46.4, 6.54, 46.44];

function makeSdk(options: { zoom?: number; extent?: Bbox } = {}) {
  return {
    Map: {
      getZoomLevel: () => options.zoom ?? 17,
      getMapExtent: () => options.extent ?? LAUSANNE,
    },
    Events: { on: () => () => undefined },
    DataModel: { Segments: { getAll: () => [] } },
    State: { getUserInfo: () => ({ rank: 3 }) },
    Editing: { getSelection: () => null },
  } as unknown as WmeSDK;
}

function makeSettings(overrides: Partial<Settings> = {}) {
  const value = { ...DEFAULT_SETTINGS, ...overrides };
  return { get: () => value, update: () => undefined } as unknown as SettingsStore;
}

/**
 * Records what the scanner asked for, and can hold each fetch open. Deferreds are kept
 * per call, not as a single pair: two overlapping scans each need their own, otherwise a
 * test aiming at the superseded run settles the current one instead.
 */
function makeFetcher() {
  const calls: Bbox[] = [];
  const pending: Array<{ resolve: (value: unknown) => void; reject: (err: Error) => void }> = [];
  let held = false;

  const fetcher = {
    fetchBbox: (bbox: Bbox) => {
      calls.push(bbox);
      if (!held) return Promise.resolve({ streets: [], truncatedKeys: [], failedKeys: [] });
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
    clearAll: () => undefined,
  } as unknown as TileFetcher;

  return {
    fetcher,
    calls,
    hold: () => {
      held = true;
    },
    resolveCall: (index: number) =>
      pending[index]?.resolve({ streets: [], truncatedKeys: [], failedKeys: [] }),
    rejectCall: (index: number, err: Error) => pending[index]?.reject(err),
  };
}

function makeScanner(sdk: WmeSDK, settings: SettingsStore) {
  const harness = makeFetcher();
  const scanner = new Scanner(sdk, harness.fetcher, settings);
  const states: ScanSnapshot["state"][] = [];
  scanner.onUpdate((snapshot) => states.push(snapshot.state));
  return { scanner, harness, states, snapshot: () => scanner.getSnapshot() };
}

describe("Scanner gating", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not call the API below the configured zoom", async () => {
    const { scanner, harness, states } = makeScanner(
      makeSdk({ zoom: 12 }),
      makeSettings({ minZoom: 15 }),
    );
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(states).toContain("zoom-gated");
    expect(harness.calls).toEqual([]);
  });

  it("stays silent abroad instead of querying a Swiss register", async () => {
    const { scanner, harness, states } = makeScanner(makeSdk({ extent: PARIS }), makeSettings());
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(states).toContain("outside-ch");
    expect(harness.calls).toEqual([]);
  });

  it("refuses a viewport over the area cap and offers the sweep when it fits", async () => {
    const { scanner, harness, snapshot } = makeScanner(
      makeSdk({ extent: BROAD_CH }),
      makeSettings(),
    );
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(snapshot().state).toBe("area-gated");
    expect(snapshot().sweepEligible).toBe(true);
    expect(harness.calls).toEqual([]);
  });

  it("does nothing at all while paused", async () => {
    const { scanner, harness, states } = makeScanner(makeSdk(), makeSettings());
    scanner.setPaused(true);
    states.length = 0;
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(harness.calls).toEqual([]);
    expect(states).toEqual([]);
  });

  it("disables itself when the feature is switched off", async () => {
    const { scanner, harness, snapshot } = makeScanner(makeSdk(), makeSettings({ enabled: false }));
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(snapshot().state).toBe("disabled");
    expect(harness.calls).toEqual([]);
  });

  it("scans when nothing gates it", async () => {
    const { scanner, harness } = makeScanner(makeSdk(), makeSettings());
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(harness.calls).toHaveLength(1);
  });
});

describe("Scanner error handling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("surfaces a network failure in the snapshot instead of throwing", async () => {
    const { scanner, harness, snapshot } = makeScanner(makeSdk(), makeSettings());
    harness.hold();
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    harness.rejectCall(0, new Error("geo.admin.ch HTTP 503"));
    await vi.advanceTimersByTimeAsync(0);

    expect(snapshot().state).toBe("error");
    expect(snapshot().error).toBe("geo.admin.ch HTTP 503");
  });

  it("keeps one throwing listener from starving the others", () => {
    const { scanner } = makeScanner(makeSdk(), makeSettings());
    const reached: string[] = [];
    scanner.onUpdate(() => {
      throw new Error("boom");
    });
    scanner.onUpdate(() => reached.push("second"));

    expect(() => scanner.setPaused(true)).not.toThrow();
    expect(reached).toEqual(["second"]);
  });
});

describe("Scanner supersession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ignores a superseded run that replies late", async () => {
    // The generation counters exist because an aborted fetch does not always reject in
    // time; a late reply must not overwrite the results of the scan that replaced it.
    const { scanner, harness, snapshot } = makeScanner(makeSdk(), makeSettings());
    harness.hold();
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(harness.calls).toHaveLength(1);

    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(harness.calls).toHaveLength(2);

    // The FIRST run replies after being superseded: it must not publish an error.
    harness.rejectCall(0, new Error("stale run"));
    await vi.advanceTimersByTimeAsync(0);

    expect(snapshot().error).toBeNull();
    expect(snapshot().state).not.toBe("error");
  });

  it("collapses a burst of map moves into a single scan", async () => {
    const { scanner, harness } = makeScanner(makeSdk(), makeSettings());
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 4);
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 4);
    scanner.requestScan();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(harness.calls).toHaveLength(1);
  });
});
