import type { ConfirmSpec } from "../ui/dialog";
import { skipOption } from "../ui/skipped-confirms";
import { t } from "./i18n";

/**
 * Confirmations described as data, so the fix flows are tested on what they ask and the
 * shared dialog renders them. Every spec says that nothing is saved automatically.
 */

const labels = () => ({
  confirmLabel: t("dialogConfirm"),
  cancelLabel: t("dialogCancel"),
});

export function overLockSpec(
  expectedLock: number | string,
  segments: number,
): ConfirmSpec {
  return {
    title: t("dlgTitleOverLock", { n: expectedLock }),
    facts: [t("dlgFactOverLock", { count: segments }), t("dlgFactNotSaved")],
    ...labels(),
  };
}

/**
 * A verdict from geometry renames a street that reads as valid, so the figures it rests
 * on travel with the question, and it never offers to be skipped.
 */
export function wrongStreetSpec(
  current: string,
  suggestion: string,
  coverage?: number,
  distanceM?: number,
): ConfirmSpec {
  const spec: ConfirmSpec = {
    title: t("dlgTitleRename", { suggestion }),
    facts: [
      t("dlgFactRenameOne", { current, suggestion }),
      t("dlgFactNotSaved"),
    ],
    warning: t("dlgWarningGeometry"),
    ...labels(),
  };
  if (coverage !== undefined) {
    spec.note = t("noteMatchConfidence", {
      pct: Math.round(coverage * 100),
      m: distanceM ?? 0,
    });
  }
  return spec;
}

/** `geometric`: the verdict comes from geometry, so it warns like the single rename. */
export function groupRenameSpec(
  n: number,
  current: string,
  suggestion: string,
  geometric: boolean,
): ConfirmSpec {
  const spec: ConfirmSpec = {
    title: t("dlgTitleRenameGroup", { count: n }),
    facts: [
      t("dlgFactRenameMany", { count: n, current, suggestion }),
      t("dlgFactNotSaved"),
    ],
    ...labels(),
  };
  if (geometric) spec.warning = t("dlgWarningGeometry");
  return spec;
}

/** Reversible and local, hence the only one an editor may stop being asked about. */
export function ignoreAllSpec(n: number): ConfirmSpec {
  return {
    title: t("dlgTitleIgnoreAll", { count: n }),
    facts: [t("dlgFactIgnoreAll"), t("dlgFactNotSaved")],
    skip: skipOption("chk.ignoreAll", t("dialogSkip")),
    ...labels(),
  };
}
