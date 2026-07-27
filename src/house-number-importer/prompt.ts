import { showWmeDialog } from "../utils";
import { t } from "./i18n";

/** Ask for a yes/no decision. Resolves false when declined or dismissed. */
export type Confirm = (message: string) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (message: string) => Promise<void>;

/**
 * Dialogs routed through the host helper rather than the browser's confirm()/alert(),
 * which look nothing like WME and block the main thread. Callers take them as injectable
 * options instead of importing them directly, so the import flows stay testable without
 * a DOM.
 *
 * Deliberately not reused from the street-name checker: that copy is bound to the
 * checker's i18next instance, so sharing it would label these buttons in whatever
 * language the other feature happens to be set to.
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
