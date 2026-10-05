import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import {
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

  it("lets clicks through to the UR marker underneath", () => {
    const { sdk, Map } = makeMapSdk();
    new UrHighlight(sdk).init();

    const style = Map.addLayer.mock.calls[0]?.[0]?.styleRules?.[0]?.style;
    expect(style?.pointerEvents).toBe("none");
  });

  it("removes the ring after a few seconds", () => {
    const { sdk, Map } = makeMapSdk();
    const highlight = new UrHighlight(sdk);
    highlight.init();
    highlight.focus({ lon: 6.6, lat: 46.5 });
    Map.removeAllFeaturesFromLayer.mockClear();

    vi.advanceTimersByTime(HIGHLIGHT_MS);

    expect(Map.removeAllFeaturesFromLayer).toHaveBeenCalledOnce();
  });

  it("keeps a single ring when another UR is clicked before the first one fades", () => {
    const { sdk, Map } = makeMapSdk();
    const highlight = new UrHighlight(sdk);
    highlight.init();

    highlight.focus({ lon: 6.6, lat: 46.5 });
    vi.advanceTimersByTime(HIGHLIGHT_MS - 100);
    highlight.focus({ lon: 6.7, lat: 46.6 });
    vi.advanceTimersByTime(200);

    // Cleared before the second ring is drawn, and the first timer no longer erases it.
    expect(Map.removeAllFeaturesFromLayer).toHaveBeenCalledTimes(2);
    expect(Map.addFeaturesToLayer).toHaveBeenCalledTimes(2);
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
