import { showWmeDialog } from "../utils";
import { t } from "./i18n";

/** Ask for a yes/no decision. Resolves false when declined or dismissed. */
export type Confirm = (message: string) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (message: string) => Promise<void>;

/**
 * Dialogs through the host helper rather than confirm()/alert(), which look nothing like
 * WME and block the main thread. The flows take them as injectable options so they stay
 * testable without a DOM.
 *
 * Not reused from the other features: their copies are bound to their own i18next
 * instances, so the buttons would be labelled in whatever language those are set to.
 */
export const confirmDialog: Confirm = async (message) => {
  const result = await showWmeDialog({
    message,
    buttons: [
      { label: t("dialogConfirm"), value: "confirm" },
      { label: t("dialogCancel"), value: "cancel" },
    ],
    cancelValue: "cancel",
  });
  return result === "confirm";
};

export const notifyDialog: Notify = async (message) => {
  await showWmeDialog({
    message,
    buttons: [{ label: t("dialogOk"), value: "ok" }],
    cancelValue: "ok",
  });
};
