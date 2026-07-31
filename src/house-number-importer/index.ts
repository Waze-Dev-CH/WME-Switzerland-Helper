/**
 * Swiss house-number importer: reads official address points from the federal building and
 * dwelling register (RegBL/GWR) and creates the missing house numbers in WME.
 *
 * The idea comes from "WME Quick HN Importer CH" by Ari (Reloaded) and Gerhard
 * (https://greasyfork.org/en/scripts/551495-wme-quick-hn-importer-ch, GPL-2.0), itself
 * based on Tom 'Glodenox' Puttemans's original concept for Belgium. Credit for showing
 * that register address points belong on the map goes to them.
 *
 * No code was taken from it: this implementation is written against the WME SDK, where the
 * original drives the DOM, and it differs on how it pages the API, assigns each number to
 * its own segment, matches bilingual street names and guards against duplicates.
 *
 * Licensed under the repository's GNU AGPL v3.0 or later (see /src note in README).
 */
import type { WmeSDK } from "wme-sdk-typings";
import { type ActivationContext, setImporterEnabled } from "./activation";
import { rateLimiter } from "../geoadmin/http";
import { Controller } from "./controller";
import { fetchGwrPoints } from "./gwr/client";
import { createGwrTileStore, GwrTileFetcher } from "./gwr/tiles";
import { resolveLocale, setLocale } from "./i18n";
import { log } from "./log";
import { AddressPointLayer, registerLayerCheckbox, setLayerCheckbox } from "./map-layer";
import { SettingsStore } from "./settings";
import { registerShortcuts } from "./shortcuts";
import { EditPanelBox } from "./ui/edit-panel";
import { TabUI } from "./ui/tab";

// Own scriptId so the importer gets its own Scripts-sidebar tab and layer checkbox:
// registerScriptTab() throws if the host's scriptId already owns a tab, so the feature
// runs as a co-resident SDK consumer rather than reusing the host SDK instance.
const SCRIPT_ID = "wme-ch-house-number-importer";
const SCRIPT_NAME = "WME CH House Number Importer";

/**
 * Bootstrap the house-number importer. Called from the host `initScript`; it acquires its
 * own SDK instance and wires the tile fetcher, the layer and the controller once WME is
 * ready.
 */
export async function initHouseNumberImporter(): Promise<void> {
  await unsafeWindow.SDK_INITIALIZED;
  if (!unsafeWindow.getWmeSdk) throw new Error("getWmeSdk is not available on the page");
  const sdk: WmeSDK = unsafeWindow.getWmeSdk({
    scriptId: SCRIPT_ID,
    scriptName: SCRIPT_NAME,
  });

  await sdk.Events.once({ eventName: "wme-ready" });

  const settings = new SettingsStore();
  setLocale(resolveLocale(settings.get().language, sdk.Settings.getLocale().localeCode));

  // The "existing buildings only" filter runs at parse time, so the setting has to reach the
  // parser through the fetcher; without this the toggle changed nothing at all. Read per
  // tile rather than captured once: switching it clears both cache levels
  // (controller.reload) and the very next fetch must already use the new value.
  const fetcher = new GwrTileFetcher(
    undefined,
    (bbox, signal) =>
      fetchGwrPoints(bbox, signal, rateLimiter, {
        existingBuildingsOnly: settings.get().existingBuildingsOnly,
      }),
    createGwrTileStore(),
  );
  const layer = new AddressPointLayer(sdk, settings);
  const controller = new Controller(sdk, fetcher, settings, layer);

  layer.init();

  // The layer checkbox and the tab's master toggle are two faces of settings.enabled;
  // both go through setImporterEnabled so neither can drift from the persisted value.
  // Set once the tab exists; the sync only ever fires on a user action, long after init.
  let tabRef: TabUI | null = null;
  const activation: ActivationContext = {
    settings,
    controller,
    layer,
    syncCheckbox: (checked) => setLayerCheckbox(sdk, checked),
    syncToggle: (checked) => tabRef?.syncEnabledToggle(checked),
  };
  const enabled = settings.get().enabled;
  layer.setVisible(enabled);
  registerLayerCheckbox(sdk, enabled, (checked) =>
    setImporterEnabled(activation, checked, "checkbox"),
  );

  const tab = new TabUI(sdk, controller, settings, (checked) =>
    setImporterEnabled(activation, checked, "tab"),
  );
  tabRef = tab;
  await tab.init();

  // The bulk-import button also lives in the segment edit panel: WME switches the sidebar
  // to its Selection panel exactly when a segment is picked, hiding the tab at the moment
  // the action is wanted.
  new EditPanelBox(sdk, controller, settings).init();
  registerShortcuts(sdk, controller, settings, {
    toggleLayer: () => setImporterEnabled(activation, !settings.get().enabled, "shortcut"),
  });

  controller.start();
  log.info(`ready (SDK ${sdk.getSDKVersion()}, WME ${sdk.getWMEVersion()})`);
}
