import { showWmeDialog } from "../utils";
import { t } from "./i18n";

/** Ask for a yes/no decision. Resolves false when declined or dismissed. */
export type Confirm = (message: string) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (message: string) => Promise<void>;

/**
 * The checker used the browser's confirm()/alert(), which look nothing like WME and block
 * the main thread while a scan may be running. These route through the host's dialog
 * helper instead. Callers take them as injectable options rather than importing them
 * directly, so the fix flows stay testable without a DOM.
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
