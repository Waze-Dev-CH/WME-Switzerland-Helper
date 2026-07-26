import type { LineString } from "geojson";
import type { WmeSDK } from "wme-sdk-typings";
import { beforeEach, describe, expect, it } from "vitest";
import { HighlightLayer } from "./map-layer";
import type { Issue } from "./matching/evaluate";
import { DEFAULT_SETTINGS, type SettingsStore } from "./settings";

const GEOMETRY: LineString = {
  type: "LineString",
  coordinates: [
    [6.63, 46.52],
    [6.64, 46.52],
  ],
};

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    segmentId: 1,
    status: "NOT_FOUND",
    currentName: "Av. de Florimont",
    suggestion: null,
    note: null,
    cityId: null,
    cityName: null,
    cantonName: null,
    roadType: 1,
    length: 120,
    geometry: GEOMETRY,
    fixable: false,
    ...overrides,
  };
}

/** Captures what the layer asks the SDK to add and remove, in order. */
function makeSdk() {
  const added: string[][] = [];
  const removed: string[][] = [];
  const sdk = {
    Map: {
      addLayer: () => undefined,
      setLayerVisibility: () => undefined,
      addFeaturesToLayer: ({ features }: { features: Array<{ id: string }> }) =>
        added.push(features.map((f) => f.id)),
      removeFeaturesFromLayer: ({ featureIds }: { featureIds: string[] }) =>
        removed.push([...featureIds]),
    },
  } as unknown as WmeSDK;
  return { sdk, added, removed };
}

const settings = { get: () => DEFAULT_SETTINGS } as unknown as SettingsStore;

describe("HighlightLayer.sync", () => {
  let harness: ReturnType<typeof makeSdk>;
  let layer: HighlightLayer;

  beforeEach(() => {
    harness = makeSdk();
    layer = new HighlightLayer(harness.sdk, settings);
  });

  const asMap = (issues: Issue[]) => new Map(issues.map((i) => [i.segmentId, i]));
  const resetCalls = () => {
    harness.added.length = 0;
    harness.removed.length = 0;
  };

  it("adds every issue on the first sync", () => {
    layer.sync(asMap([issue({ segmentId: 1 }), issue({ segmentId: 2 })]));
    expect(harness.added).toEqual([["chk-1", "chk-2"]]);
    expect(harness.removed).toEqual([]);
  });

  it("does nothing at all when the issues are unchanged", () => {
    // The reason this diffing exists: reevaluate() publishes a fresh map on every WME
    // edit, and rebuilding hundreds of features each time churned the map for nothing.
    const issues = [issue({ segmentId: 1 }), issue({ segmentId: 2 })];
    layer.sync(asMap(issues));
    resetCalls();

    layer.sync(asMap(issues.map((i) => ({ ...i }))));
    expect(harness.added).toEqual([]);
    expect(harness.removed).toEqual([]);
  });

  it("touches only the segment whose status changed", () => {
    layer.sync(asMap([issue({ segmentId: 1 }), issue({ segmentId: 2 })]));
    resetCalls();

    layer.sync(asMap([issue({ segmentId: 1, status: "COSMETIC" }), issue({ segmentId: 2 })]));
    expect(harness.removed).toEqual([["chk-1"]]);
    expect(harness.added).toEqual([["chk-1"]]);
  });

  it("redraws when only the suggestion changed, since the map label shows it", () => {
    layer.sync(asMap([issue({ segmentId: 1 })]));
    resetCalls();

    layer.sync(asMap([issue({ segmentId: 1, suggestion: "Avenue de Florimont" })]));
    expect(harness.added).toEqual([["chk-1"]]);
  });

  it("redraws when the geometry moved", () => {
    layer.sync(asMap([issue({ segmentId: 1 })]));
    resetCalls();

    layer.sync(
      asMap([
        issue({
          segmentId: 1,
          geometry: {
            type: "LineString",
            coordinates: [
              [6.63, 46.52],
              [6.65, 46.53],
            ],
          },
        }),
      ]),
    );
    expect(harness.added).toEqual([["chk-1"]]);
  });

  it("ignores fields the feature does not carry", () => {
    // roadType and length are not part of the rendered signature; a change there must
    // not cost a redraw.
    layer.sync(asMap([issue({ segmentId: 1 })]));
    resetCalls();

    layer.sync(asMap([issue({ segmentId: 1, roadType: 7, length: 999 })]));
    expect(harness.added).toEqual([]);
    expect(harness.removed).toEqual([]);
  });

  it("removes a segment that stopped being an issue, e.g. after a fix", () => {
    layer.sync(asMap([issue({ segmentId: 1 }), issue({ segmentId: 2 })]));
    resetCalls();

    layer.sync(asMap([issue({ segmentId: 2 })]));
    expect(harness.removed).toEqual([["chk-1"]]);
    expect(harness.added).toEqual([]);
  });

  it("clears everything when the results are emptied", () => {
    layer.sync(asMap([issue({ segmentId: 1 }), issue({ segmentId: 2 })]));
    resetCalls();

    layer.sync(new Map());
    expect(harness.removed).toEqual([["chk-1", "chk-2"]]);
    expect(harness.added).toEqual([]);
  });
});
