/**
 * Speed-camera URs: Swiss law forbids showing fixed speed cameras in Waze, yet reporters
 * keep opening URs for them. This lists the open ones on screen, sends each reporter the
 * official explanation in their language and closes the UR as not-identified.
 *
 * Licensed under the repository's GNU AGPL v3.0 or later (see /src note in README).
 */
import type { WmeSDK } from "wme-sdk-typings";
import { normalizeLocale, setLocale, t } from "./i18n";
import { log } from "./log";
import { UrHighlight } from "./map-highlight";
import { Scanner } from "./scanner";
import { loadSettings } from "./settings";
import { TabUI } from "./ui/tab";

// Own scriptId so this feature gets its own Scripts-sidebar tab: registerScriptTab() throws
// if the host's scriptId already owns a tab.
const SCRIPT_ID = "wme-ch-speed-camera-urs";
const SCRIPT_NAME = "WME CH UR Assistant";

export async function initSpeedCameraUrs(): Promise<void> {
  await unsafeWindow.SDK_INITIALIZED;
  if (!unsafeWindow.getWmeSdk)
    throw new Error("getWmeSdk is not available on the page");
  const sdk: WmeSDK = unsafeWindow.getWmeSdk({
    scriptId: SCRIPT_ID,
    scriptName: SCRIPT_NAME,
  });

  await sdk.Events.once({ eventName: "wme-ready" });
  setLocale(normalizeLocale(sdk.Settings.getLocale().localeCode));

  const settings = loadSettings();
  const scanner = new Scanner(sdk);
  scanner.setReadSpeedCamera(settings.criteria.speedCamera);
  scanner.setReadStale(settings.criteria.stale);
  scanner.setReadMapMate(settings.criteria.mapMate);
  const highlight = new UrHighlight(sdk);
  highlight.init();
  const tab = new TabUI(sdk, scanner, highlight, settings);
  await tab.init();
  registerWindowShortcut(sdk, () => tab.toggleWindow());
  scanner.start();
  log.info(`ready (SDK ${sdk.getSDKVersion()}, WME ${sdk.getWMEVersion()})`);
}

/**
 * No default keys: Alt+W already belongs to the street-name window, and most free Alt
 * combinations are WME's. The editor binds one in WME's keyboard settings if they want it.
 */
function registerWindowShortcut(sdk: WmeSDK, toggle: () => void): void {
  try {
    sdk.Shortcuts.createShortcut({
      shortcutId: "scu-toggle-window",
      description: t("shortcutToggleWindow"),
      shortcutKeys: null,
      callback: toggle,
    });
  } catch (err) {
    // Likely a second init (Tampermonkey re-injection): the first binding stays.
    log.warn(
      "Window shortcut already registered; keeping the existing binding",
      err,
    );
  }
}
