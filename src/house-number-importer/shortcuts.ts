import type { WmeSDK } from "wme-sdk-typings";
import type { Controller } from "./controller";
import { t } from "./i18n";
import { log } from "./log";
import type { SettingsStore } from "./settings";

/**
 * Keyboard shortcuts, remappable in WME's own keyboard settings.
 *
 * Defaults use Alt to stay clear of WME's bindings. This is the whole difference with the
 * reference userscript, which captured a bare `R` in the capture phase and called
 * stopImmediatePropagation: that key is WME's own "reverse direction", and the script broke
 * it for as long as it stayed installed.
 */
export function registerShortcuts(
  sdk: WmeSDK,
  controller: Controller,
  settings: SettingsStore,
  actions: { toggleLayer: () => void },
): void {
  const create = (shortcutId: string, description: string, keys: string, callback: () => void) => {
    try {
      sdk.Shortcuts.createShortcut({ shortcutId, description, shortcutKeys: keys, callback });
    } catch (err) {
      log.warn(`Shortcut keys "${keys}" unavailable for ${shortcutId}; registering unbound`, err);
      try {
        sdk.Shortcuts.createShortcut({ shortcutId, description, shortcutKeys: null, callback });
      } catch (collision) {
        // Likely an id collision (double init / Tampermonkey re-injection): the shortcut
        // stays bound to the first closure. Nothing more we can do, but warn so it is not
        // lost when debugging stale-handler reports.
        log.warn(`Shortcut id "${shortcutId}" already registered; keeping the binding`, collision);
      }
    }
  };

  // The point of this one is to reach the bulk import without moving the mouse off the map,
  // while the sidebar shows WME's Selection panel.
  create("hn-import-missing", t("shortcutImportMissing"), "A+h", () => {
    if (settings.get().enabled) void controller.importMissing();
  });

  // Deliberately not gated on `enabled`: this is how the feature gets switched back on
  // without hunting for the layer checkbox.
  create("hn-toggle-layer", t("shortcutToggleLayer"), "A+j", () => actions.toggleLayer());
}
