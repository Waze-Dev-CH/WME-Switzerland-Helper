import type { WmeSDK } from "wme-sdk-typings";
import { fixSegment, withFixLock } from "./fix";
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
  actions: { nextIssue: () => void },
): void {
  const create = (shortcutId: string, description: string, keys: string, callback: () => void) => {
    try {
      sdk.Shortcuts.createShortcut({ shortcutId, description, shortcutKeys: keys, callback });
    } catch (err) {
      log.warn(`Shortcut keys "${keys}" unavailable for ${shortcutId}; registering unbound`, err);
      try {
        sdk.Shortcuts.createShortcut({ shortcutId, description, shortcutKeys: null, callback });
      } catch {
        // shortcut id collision: nothing more we can do
      }
    }
  };

  create("chk-next-issue", t("shortcutNextIssue"), "A+n", () => {
    if (settings.get().enabled) actions.nextIssue();
  });

  create("chk-fix-selected", t("shortcutFixSelected"), "A+f", () => {
    if (!settings.get().enabled) return;
    const selection = sdk.Editing.getSelection();
    if (selection?.objectType !== "segment" || selection.ids.length !== 1) return;
    const issue = scanner.getSnapshot().issues.get(selection.ids[0] as number);
    if (!issue?.fixable) return;
    // Lowering an over-lock is often unwanted; confirm before applying.
    if (
      issue.status === "OVER_LOCK" &&
      !confirm(t("confirmOverLockFix", { n: issue.note?.expectedLock ?? "" }))
    ) {
      return;
    }
    void withFixLock(async () => fixSegment(sdk, issue, settings.get())).then((result) => {
      if (result !== null) scanner.reevaluate();
    });
  });
}
