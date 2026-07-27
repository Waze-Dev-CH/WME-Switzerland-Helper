import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import { Controller } from "./controller";
import { GwrTileFetcher, TileCache } from "./gwr/tiles";
import type { GwrPoint } from "./gwr/types";
import { withImportLock } from "./import";
import type { AddressPointLayer } from "./map-layer";
import { SettingsStore } from "./settings";

const SEGMENT_ID = 1;
const SEGMENT_COORDINATES = [
  [6.6, 46.5],
  [6.61, 46.5],
];

const point = (number: string): GwrPoint => ({
  id: `p-${number}`,
  number,
  streetNames: ["Rue Exemple"],
  esid: 1,
  lon: 6.601,
  lat: 46.5,
  officialAddress: true,
});

/**
 * A stub whose `fetchHouseNumbers` answers what the SERVER knows, which is the crux here:
 * it never sees unsaved edits, exactly like the real one.
 */
function makeSdk(serverNumbers: string[]) {
  const added: string[] = [];
  const handlers = new Map<string, Array<() => void>>();
  const sdk = {
    Events: {
      on: ({ eventName, eventHandler }: { eventName: string; eventHandler: () => void }) => {
        const list = handlers.get(eventName) ?? [];
        list.push(eventHandler);
        handlers.set(eventName, list);
        return () => undefined;
      },
      once: () => Promise.resolve(),
    },
    Map: {
      getMapExtent: () => [6.6, 46.5, 6.61, 46.505],
      getZoomLevel: () => 18,
    },
    Editing: {
      getSelection: () => ({ objectType: "segment", ids: [SEGMENT_ID] }),
      isEditingAllowed: () => true,
      getUnsavedChangesCount: () => 0,
    },
    DataModel: {
      Segments: {
        getAll: () => [
          { id: SEGMENT_ID, geometry: { type: "LineString", coordinates: SEGMENT_COORDINATES } },
        ],
        getById: () => ({
          id: SEGMENT_ID,
          roadType: 1,
          geometry: { type: "LineString", coordinates: SEGMENT_COORDINATES },
        }),
        getAddress: () => ({ street: { name: "Rue Exemple" }, altStreets: [] }),
      },
      HouseNumbers: {
        fetchHouseNumbers: () => Promise.resolve(serverNumbers.map((number) => ({ number }))),
        addHouseNumber: (args: { number: string }) => added.push(args.number),
      },
    },
  } as unknown as WmeSDK;
  /** Fire a WME event the way the editor would. */
  const emit = (eventName: string) => {
    for (const handler of handlers.get(eventName) ?? []) handler();
  };
  return { sdk, added, emit };
}

function makeLayer(): AddressPointLayer {
  return {
    sync: () => undefined,
    clear: () => undefined,
    setVisible: () => undefined,
    pointOf: () => null,
  } as unknown as AddressPointLayer;
}

function makeController(sdk: WmeSDK, points: GwrPoint[]) {
  const fetcher = new GwrTileFetcher(new TileCache(), async () => ({ points, truncated: false }));
  const settings = new SettingsStore();
  settings.update({ enabled: true, minZoom: 15 });
  return new Controller(sdk, fetcher, settings, makeLayer(), {
    confirm: async () => true,
    notify: async () => undefined,
  });
}

describe("Controller", () => {
  beforeEach(async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    // Make sure no earlier test left the module-level import lock held.
    await withImportLock(async () => undefined);
  });

  it("assigns each missing number to a segment of its street", async () => {
    const { sdk } = makeSdk([]);
    const controller = makeController(sdk, [point("2"), point("4")]);

    await controller.refresh();

    expect(controller.getSnapshot().missing.map((a) => a.segmentId)).toEqual([
      SEGMENT_ID,
      SEGMENT_ID,
    ]);
  });

  it("does not offer a number the server already reports", async () => {
    const { sdk } = makeSdk(["2"]);
    const controller = makeController(sdk, [point("2"), point("4")]);

    await controller.refresh();

    expect(controller.getSnapshot().missing.map((a) => a.point.number)).toEqual(["4"]);
  });

  it("keeps a just-created number out of the list even though the server ignores it", async () => {
    // The regression that made a second click duplicate everything: our own creations
    // trigger a refetch, the server answer does not contain them (they are unsaved), and
    // the button came back with the very same list.
    const { sdk, added } = makeSdk([]); // the server keeps saying "nothing here"
    const controller = makeController(sdk, [point("2"), point("4")]);
    await controller.refresh();
    expect(controller.getSnapshot().missing).toHaveLength(2);

    await controller.importMissing();
    expect(added).toEqual(["2", "4"]);
    expect(controller.getSnapshot().missing).toHaveLength(0);

    // The refetch our own creations trigger must not resurrect them.
    await controller.refresh({ refetchExisting: true });
    expect(controller.getSnapshot().missing).toHaveLength(0);
  });

  it.each(["wme-after-undo", "wme-no-edits", "wme-house-number-deleted", "wme-save-finished"])(
    "offers the numbers again after %s",
    async (eventName) => {
      // Ctrl+Z is the everyday case, and it emits wme-after-undo, NOT
      // wme-house-number-deleted. Listening for the latter alone left the undone numbers
      // looking like they still existed: pale instead of green, and no way to redo the work.
      const { sdk, emit } = makeSdk([]);
      const controller = makeController(sdk, [point("2"), point("4")]);
      controller.start();
      await controller.refresh();
      await controller.importMissing();
      expect(controller.getSnapshot().missing).toHaveLength(0);

      emit(eventName);
      await controller.refresh({ refetchExisting: true });

      expect(controller.getSnapshot().missing).toHaveLength(2);
    },
  );

  it("creates nothing on a second import, even if one is attempted", async () => {
    const { sdk, added } = makeSdk([]);
    const controller = makeController(sdk, [point("2"), point("4")]);
    await controller.refresh();

    await controller.importMissing();
    await controller.refresh({ refetchExisting: true });
    await controller.importMissing();

    expect(added).toEqual(["2", "4"]);
  });
});
