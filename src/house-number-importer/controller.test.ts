import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WmeSDK } from "wme-sdk-typings";
import { canBulkImport, Controller } from "./controller";
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
  // Mutable, so a test can move the selection to another street without a second SDK.
  let streetName = "Rue Exemple";
  let editingAllowed = true;
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
      isEditingAllowed: () => editingAllowed,
      getUnsavedChangesCount: () => 0,
    },
    DataModel: {
      Segments: {
        getAll: () => [
          {
            id: SEGMENT_ID,
            geometry: { type: "LineString", coordinates: SEGMENT_COORDINATES },
          },
        ],
        getById: () => ({
          id: SEGMENT_ID,
          roadType: 1,
          geometry: { type: "LineString", coordinates: SEGMENT_COORDINATES },
        }),
        getAddress: () => ({ street: { name: streetName }, altStreets: [] }),
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
  const setStreetName = (name: string) => {
    streetName = name;
  };
  const setEditingAllowed = (allowed: boolean) => {
    editingAllowed = allowed;
  };
  return { sdk, added, emit, setStreetName, setEditingAllowed };
}

function makeLayer(): AddressPointLayer {
  return {
    sync: () => undefined,
    clear: () => undefined,
    setVisible: () => undefined,
    pointOf: () => null,
  } as unknown as AddressPointLayer;
}

function makeController(
  sdk: WmeSDK,
  points: GwrPoint[],
  tile: { truncated?: boolean; fail?: boolean } = {},
) {
  const fetcher = new GwrTileFetcher(new TileCache(), async () => {
    if (tile.fail) throw new Error("tile unavailable");
    return { points, truncated: tile.truncated ?? false };
  });
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

  it.each(["wme-no-edits", "wme-save-finished"])(
    "offers every number again after %s",
    async (eventName) => {
      // Nothing is pending any more, or the server now knows everything: the refetch is the
      // truth again, so the whole optimistic set can go.
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

  it.each(["wme-after-undo", "wme-house-number-deleted"])(
    "offers only the last creation again after %s",
    async (eventName) => {
      // Ctrl+Z is the everyday case and it emits wme-after-undo, NOT
      // wme-house-number-deleted, so both are listened to. One undo is one edit: forgetting
      // the whole batch put every number back in the list while they all still existed,
      // which is an invitation to create duplicates.
      const { sdk, emit } = makeSdk([]);
      const controller = makeController(sdk, [point("2"), point("4")]);
      controller.start();
      await controller.refresh();
      await controller.importMissing();
      expect(controller.getSnapshot().missing).toHaveLength(0);

      emit(eventName);
      await controller.refresh({ refetchExisting: true });

      expect(controller.getSnapshot().missing.map((a) => a.point.number)).toEqual(["4"]);
    },
  );

  it("does not let a number created on one street hide the same number on another", async () => {
    // "15" on Rue Exemple says nothing about "15" on Autre-Rue. Keyed by number alone, the
    // second street came back with its 15 already marked as present and unimportable.
    const { sdk, setStreetName } = makeSdk([]);
    const elsewhere: GwrPoint = {
      ...point("15"),
      id: "p-15-other",
      streetNames: ["Autre-Rue"],
    };
    const controller = makeController(sdk, [point("15"), elsewhere]);
    await controller.refresh();
    await controller.importMissing();
    expect(controller.getSnapshot().missing).toHaveLength(0);

    setStreetName("Autre-Rue");
    await controller.refresh({ refetchExisting: true });

    expect(controller.getSnapshot().missing.map((a) => a.point.number)).toEqual(["15"]);
  });

  it("keeps the assignments, and only withholds the bulk import, on a truncated tile", async () => {
    // Emptying the list left the points clickable with no assignment, and the fallback hung
    // them on the selected segment, which on a corner is regularly the cross street.
    const { sdk } = makeSdk([]);
    const controller = makeController(sdk, [point("2")], { truncated: true });

    await controller.refresh();

    expect(controller.getSnapshot().truncated).toBe(true);
    expect(controller.getSnapshot().missing).toHaveLength(1);
    expect(canBulkImport(controller.getSnapshot())).toBe(false);
  });

  it("refuses the bulk import when a tile failed to load", async () => {
    // A failed tile is silent: its addresses simply are not there, so "nothing missing"
    // would be a claim about a block nobody looked at.
    const { sdk, added } = makeSdk([]);
    const controller = makeController(sdk, [], { fail: true });

    await controller.refresh();
    await controller.importMissing();

    expect(controller.getSnapshot().incomplete).toBe(true);
    expect(added).toEqual([]);
  });

  it("does not mark a failed creation as present", async () => {
    // Editing revoked before the batch: nothing was created, so everything stays offered.
    const { sdk, setEditingAllowed } = makeSdk([]);
    const controller = makeController(sdk, [point("2"), point("4")]);
    await controller.refresh();

    setEditingAllowed(false);
    await controller.importMissing();

    expect(controller.getSnapshot().missing).toHaveLength(2);
  });

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
