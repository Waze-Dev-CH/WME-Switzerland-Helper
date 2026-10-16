import type { ConfirmSpec } from "../ui/dialog";
import { t } from "./i18n";
import { showConfirm, showNotice } from "../ui/dialog";

/** Ask for a yes/no decision described by `spec`. Resolves false when declined or dismissed. */
export type Confirm = (spec: ConfirmSpec) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (notice: { title: string; text: string }) => Promise<void>;

/**
 * The flows take these as injectable options so they stay testable without a DOM: a test
 * passes a stub and reads the spec it was handed.
 */
export const confirmDialog: Confirm = (spec) => showConfirm(spec);

export const notifyDialog: Notify = ({ title, text }) =>
  showNotice({ title, text, okLabel: t("dialogOk") });
