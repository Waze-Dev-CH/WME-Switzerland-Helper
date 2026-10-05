import type { ConfirmSpec } from "./confirm-spec";
import { showConfirm, showNotice } from "./ui/dialog";

/** Ask for a yes/no decision described by `spec`. Resolves false when declined or dismissed. */
export type Confirm = (spec: ConfirmSpec) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (message: string) => Promise<void>;

/**
 * The flows take these as injectable options so they stay testable without a DOM: a test
 * passes a stub and reads the spec it was handed.
 */
export const confirmDialog: Confirm = (spec) => showConfirm(spec);

export const notifyDialog: Notify = (message) => showNotice(message);
