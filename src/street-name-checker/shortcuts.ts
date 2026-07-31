import type { WmeSDK } from "wme-sdk-typings";
import { runFix } from "./fix";
import { t } from "./i18n";
import { log } from "./log";
import type { Scanner } from "./scan";
import type { SettingsStore } from "./settings";

/**
 * Keyboard shortcuts (remappable in the native WME keyboard settings).
 * Default keys use Alt to stay clear of WME's own bindings; on collision the
 * shortcut is registered without keys so the user can assign their own.
 */
export function registerShortcuts(
  sdk: WmeSDK,
  scanner: Scanner,
  settings: SettingsStore,
  actions: { nextIssue: () => void; toggleWindow: () => void },
): void {
  const create = (shortcutId: string, description: string, keys: string, callback: () => void) => {
    try {
      sdk.Shortcuts.createShortcut({ shortcutId, description, shortcutKeys: keys, callback });
    } catch (err) {
      log.warn(`Shortcut keys "${keys}" unavailable for ${shortcutId}; registering unbound`, err);
      try {
        sdk.Shortcuts.createShortcut({ shortcutId, description, shortcutKeys: null, callback });
      } catch (collision) {
        // Likely an id collision (double init / Tampermonkey re-injection): the
        // shortcut stays bound to the first closure (a stale instance). Nothing more
        // we can do, but warn so it is not lost when debugging stale-handler reports.
        log.warn(`Shortcut id "${shortcutId}" already registered; keeping the existing binding`, collision);
      }
    }
  };

  create("chk-next-issue", t("shortcutNextIssue"), "A+n", () => {
    if (settings.get().enabled) actions.nextIssue();
  });

  // Deliberately not gated on `enabled`: this is how you get the window back after
  // closing it, and a disabled checker still has a panel worth reaching.
  create("chk-toggle-window", t("shortcutToggleWindow"), "A+w", () => actions.toggleWindow());

  create("chk-fix-selected", t("shortcutFixSelected"), "A+f", () => {
    if (!settings.get().enabled) return;
    const selection = sdk.Editing.getSelection();
    if (selection?.objectType !== "segment" || selection.ids.length !== 1) return;
    const issue = scanner.getSnapshot().issues.get(selection.ids[0] as number);
    if (!issue?.fixable) return;
    // Same runner as the tab and the edit-panel box: a third copy of the confirm rules
    // here is how the geometry-verdict confirmation went missing on this path. The
    // shortcut API stays synchronous, the flow is awaited inside.
    void runFix(sdk, issue, settings.get(), { onComplete: () => scanner.reevaluate() });
  });
}
