import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import {
  BLINK_MS,
  FOCUS_ZOOM,
  focusZoom,
  HIGHLIGHT_MS,
  UrHighlight,
} from "./map-highlight";

function makeMapSdk(zoom = 14) {
  const Map = {
    addLayer: vi.fn(),
    addFeaturesToLayer: vi.fn(),
    removeAllFeaturesFromLayer: vi.fn(),
    getZoomLevel: vi.fn(() => zoom),
    setMapCenter: vi.fn(),
  };
  return { sdk: { Map } as unknown as WmeSDK, Map };
}

describe("focusZoom", () => {
  it("zooms in far enough for the UR marker to be clicked", () => {
    expect(focusZoom(12)).toBe(FOCUS_ZOOM);
  });

  it("never zooms out an editor who is already closer", () => {
    expect(focusZoom(19)).toBe(19);
    expect(focusZoom(FOCUS_ZOOM)).toBe(FOCUS_ZOOM);
  });
});

describe("UrHighlight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("centres and zooms on the UR, then rings it", () => {
    const { sdk, Map } = makeMapSdk(14);
    const highlight = new UrHighlight(sdk);
    highlight.init();

    highlight.focus({ lon: 6.6, lat: 46.5 });

    expect(Map.setMapCenter).toHaveBeenCalledWith({
      lonLat: { lon: 6.6, lat: 46.5 },
      zoomLevel: FOCUS_ZOOM,
    });
    const features = Map.addFeaturesToLayer.mock.calls[0]?.[0]?.features;
    expect(features?.[0]?.geometry).toEqual({
      type: "Point",
      coordinates: [6.6, 46.5],
    });
  });

  it("lets clicks through to the UR marker underneath, in both blink phases", () => {
    const { sdk, Map } = makeMapSdk();
    new UrHighlight(sdk).init();

    const rules = Map.addLayer.mock.calls[0]?.[0]?.styleRules ?? [];
    expect(rules).toHaveLength(2);
    for (const rule of rules) expect(rule.style.pointerEvents).toBe("none");
  });

  it("blinks by alternating its two looks", () => {
    const { sdk, Map } = makeMapSdk();
    const highlight = new UrHighlight(sdk);
    highlight.init();
    const phases = () =>
      Map.addFeaturesToLayer.mock.calls.map(
        (call) => call[0].features[0].properties.phase,
      );

    highlight.focus({ lon: 6.6, lat: 46.5 });
    vi.advanceTimersByTime(BLINK_MS);
    vi.advanceTimersByTime(BLINK_MS);

    expect(phases()).toEqual(["a", "b", "a"]);
  });

  it("stops blinking and removes the ring after a few seconds", () => {
    const { sdk, Map } = makeMapSdk();
    const highlight = new UrHighlight(sdk);
    highlight.init();
    highlight.focus({ lon: 6.6, lat: 46.5 });

    vi.advanceTimersByTime(HIGHLIGHT_MS);
    const drawn = Map.addFeaturesToLayer.mock.calls.length;
    const cleared = Map.removeAllFeaturesFromLayer.mock.calls.length;
    vi.advanceTimersByTime(HIGHLIGHT_MS);

    expect(Map.addFeaturesToLayer.mock.calls.length).toBe(drawn);
    expect(Map.removeAllFeaturesFromLayer.mock.calls.length).toBe(cleared);
  });

  it("moves the blink to the new UR when another one is clicked meanwhile", () => {
    const { sdk, Map } = makeMapSdk();
    const highlight = new UrHighlight(sdk);
    highlight.init();

    highlight.focus({ lon: 6.6, lat: 46.5 });
    vi.advanceTimersByTime(HIGHLIGHT_MS - 100);
    highlight.focus({ lon: 6.7, lat: 46.6 });
    const afterSecond = Map.addFeaturesToLayer.mock.calls.length;
    vi.advanceTimersByTime(BLINK_MS * 3);

    const later = Map.addFeaturesToLayer.mock.calls.slice(afterSecond - 1);
    for (const call of later) {
      expect(call[0].features[0].geometry.coordinates).toEqual([6.7, 46.6]);
    }
    // The first ring's end timer must not cut the second one short.
    expect(later.length).toBeGreaterThan(3);
  });

  it("still centres the map when the layer could not be created", () => {
    const { sdk, Map } = makeMapSdk();
    Map.addLayer.mockImplementation(() => {
      throw new Error("no layer");
    });
    const highlight = new UrHighlight(sdk);
    highlight.init();

    highlight.focus({ lon: 6.6, lat: 46.5 });

    expect(Map.setMapCenter).toHaveBeenCalledOnce();
    expect(Map.addFeaturesToLayer).not.toHaveBeenCalled();
  });
});
