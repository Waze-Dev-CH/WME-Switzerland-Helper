import type { ConfirmSpec } from "../ui/dialog";
import { t } from "./i18n";

/**
 * Confirmations described as data, so the import flows are tested on what they ask and
 * the shared dialog renders them. Both say that nothing is saved automatically.
 */

const labels = () => ({
  confirmLabel: t("dialogConfirm"),
  cancelLabel: t("dialogCancel"),
});

/**
 * One object, instantly undoable: asked only when the editor opted in, and the box turns
 * that opt-in back off through `onSkip`.
 */
export function singleImportSpec(number: string, street: string, onSkip: () => void): ConfirmSpec {
  return {
    title: t("dlgTitleSingle", { number }),
    facts: [t("dlgFactSingle", { number, street }), t("dlgFactNotSaved")],
    skip: { label: t("dialogSkip"), isSkipped: false, remember: onSkip },
    ...labels(),
  };
}

/**
 * Never skippable: forty numbers in one click always get a recap. `cap` and `total` are
 * given together when more numbers are missing than one action may create.
 */
export function massImportSpec(args: {
  count: number;
  cap?: number;
  total?: number;
  street: string;
  numbers: string;
  segments: number;
  unverifiedName: boolean;
}): ConfirmSpec {
  const { cap, total } = args;
  const title =
    cap !== undefined && total !== undefined
      ? t("dlgTitleMassCapped", { cap, total, street: args.street })
      : t("dlgTitleMass", { count: args.count, street: args.street });

  const facts = [t("dlgFactNotSaved")];
  if (cap !== undefined) facts.push(t("dlgFactCap", { cap }));
  // A street is several WME segments, and each number hangs from its own. Say so, or a
  // batch touching five segments looks like it only touched the selected one.
  if (args.segments > 1) facts.push(t("confirmMassImportSegments", { segments: args.segments }));
  // The coordinates come from the register's entrance point, which is usually right but
  // not always: a courtyard entrance, a building set back from the road.
  facts.push(t("confirmMassImportReview"));

  const spec: ConfirmSpec = {
    title,
    facts,
    note: t("dlgNoteNumbers", { numbers: args.numbers }),
    ...labels(),
  };
  // Informative, not blocking: the register can lag reality.
  if (args.unverifiedName) spec.warning = t("confirmMassImportUnverifiedName");
  return spec;
}
