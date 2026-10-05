/**
 * Speed-camera URs: Swiss law forbids showing fixed speed cameras in Waze, yet reporters
 * keep opening URs for them. This lists the open ones on screen, sends each reporter the
 * official explanation in their language and closes the UR as not-identified.
 *
 * Licensed under the repository's GNU AGPL v3.0 or later (see /src note in README).
 */
import type { WmeSDK } from "wme-sdk-typings";
import { normalizeLocale, setLocale } from "./i18n";
import { log } from "./log";
import { UrHighlight } from "./map-highlight";
import { Scanner } from "./scanner";
import { TabUI } from "./ui/tab";

// Own scriptId so this feature gets its own Scripts-sidebar tab: registerScriptTab() throws
// if the host's scriptId already owns a tab.
const SCRIPT_ID = "wme-ch-speed-camera-urs";
const SCRIPT_NAME = "WME CH Speed Camera URs";

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

  const scanner = new Scanner(sdk);
  const highlight = new UrHighlight(sdk);
  highlight.init();
  await new TabUI(sdk, scanner, highlight).init();
  scanner.start();
  log.info(`ready (SDK ${sdk.getSDKVersion()}, WME ${sdk.getWMEVersion()})`);
}
