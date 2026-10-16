import { type ConfirmSpec, showConfirm, showNotice } from "../ui/dialog";
import { t } from "./i18n";

/** Ask for a yes/no decision described by `spec`. Resolves false when declined or dismissed. */
export type Confirm = (spec: ConfirmSpec) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (notice: { title: string; text: string }) => Promise<void>;

/**
 * Callers take these as injectable options rather than importing the dialog directly,
 * so the import flows stay testable without a DOM: a test passes a stub and reads the spec.
 *
 * Deliberately not reused from the street-name checker: that copy is bound to the
 * checker's i18next instance, so sharing it would label these buttons in whatever
 * language the other feature happens to be set to.
 */
export const confirmDialog: Confirm = (spec) => showConfirm(spec);

export const notifyDialog: Notify = ({ title, text }) =>
  showNotice({ title, text, okLabel: t("dialogOk") });
