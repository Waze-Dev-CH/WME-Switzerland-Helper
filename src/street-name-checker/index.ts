/**
 * Swiss official street-name checker — ported from the standalone
 * WME-CH-Street-Name-Checker userscript (author: Yann Rapenne).
 * Licensed under the repository's GNU AGPL v3.0 or later (see /src note in README).
 */
import type { WmeSDK } from "wme-sdk-typings";
import { registerStreetNameProvider } from "../street-check-bridge";
import { type ActivationContext, setCheckerEnabled } from "./activation";
import { createStreetNameProvider } from "./name-verdict";
import { IdbTileStore } from "./geoadmin/idb-store";
import { TileFetcher } from "./geoadmin/tiles";
import { resolveLocale, setLocale } from "./i18n";
import { log } from "./log";
import { HighlightLayer, registerLayerCheckbox, setLayerCheckbox } from "./map-layer";
import { Scanner } from "./scan";
import { registerShortcuts } from "./shortcuts";
import { SettingsStore } from "./settings";
import { EditPanelBox } from "./ui/edit-panel";
import { TabUI } from "./ui/tab";
import { createWindowMode } from "./ui/window-mode";

// Own scriptId so the checker gets its own Scripts-sidebar tab and layer checkbox:
// registerScriptTab() throws if the host's scriptId already owns a tab, so the feature
// runs as a co-resident SDK consumer rather than reusing the host SDK instance.
const SCRIPT_ID = "wme-ch-street-name-checker";
const SCRIPT_NAME = "WME CH Street Name Checker";

/**
 * Bootstrap the street-name checker. Called from the host `initScript`; it acquires its
 * own SDK instance (own scriptId) and wires the scanner, layer, tab, edit-panel box and
 * shortcuts once WME is ready.
 */
export async function initStreetNameChecker(): Promise<void> {
  await unsafeWindow.SDK_INITIALIZED;
  if (!unsafeWindow.getWmeSdk) throw new Error("getWmeSdk is not available on the page");
  const sdk: WmeSDK = unsafeWindow.getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });

  await sdk.Events.once({ eventName: "wme-ready" });

  // Rank gates the default-on lock categories; SDK is ready (wme-ready) so rank is available.
  const settings = new SettingsStore(sdk.State.getUserInfo()?.rank ?? null);
  setLocale(resolveLocale(settings.get().language, sdk.Settings.getLocale().localeCode));
  const fetcher = new TileFetcher(undefined, undefined, new IdbTileStore());
  const scanner = new Scanner(sdk, fetcher, settings);
  const layer = new HighlightLayer(sdk, settings);

  layer.init();

  // The layer checkbox and the tab's master toggle are two faces of settings.enabled;
  // both go through setCheckerEnabled so neither can drift from the persisted value.
  const activation: ActivationContext = {
    settings,
    scanner,
    layer,
    syncCheckbox: (checked) => setLayerCheckbox(sdk, checked),
  };
  const enabled = settings.get().enabled;
  layer.setVisible(enabled);
  registerLayerCheckbox(sdk, enabled, (checked) => setCheckerEnabled(activation, checked, "checkbox"));

  // Resync the OpenLayers layer only when results actually change; progress
  // ticks during a fetch reuse the same issues map and must stay free.
  let lastSyncedIssues: ReadonlyMap<number, unknown> | null = null;
  scanner.onUpdate((snapshot) => {
    if (snapshot.issues !== lastSyncedIssues) {
      lastSyncedIssues = snapshot.issues;
      layer.sync(snapshot.issues);
    }
  });

  // The controller needs a built tab, and the tab needs a way to reach the controller.
  // The indirection resolves it: the handler is only ever called on a user click, long
  // after both exist.
  let detachHandler = (): void => undefined;
  const tab = new TabUI(
    sdk,
    scanner,
    settings,
    (checked) => setCheckerEnabled(activation, checked, "tab"),
    () => detachHandler(),
  );
  await tab.init();

  const windowMode = createWindowMode(settings, tab);
  detachHandler = () => windowMode.detach();
  windowMode.restore();

  new EditPanelBox(sdk, scanner, settings).init();
  registerShortcuts(sdk, scanner, settings, {
    nextIssue: () => tab.selectNextIssue(),
    toggleWindow: () => windowMode.toggle(),
  });

  scanner.start();

  // Publish "is this street's name official?" for the other features. A function, not the
  // Scanner: they get the answer without being able to touch the scan, and the tricky part
  // (an absent issue only means "conform" once a scan has completed) stays here.
  registerStreetNameProvider(
    createStreetNameProvider({ sdk, settings, getSnapshot: () => scanner.getSnapshot() }),
  );

  log.info(`ready (SDK ${sdk.getSDKVersion()}, WME ${sdk.getWMEVersion()})`);
}
