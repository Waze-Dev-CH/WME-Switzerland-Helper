import i18next from "i18next";
import type { ChoiceSpec, ConfirmSpec } from "./ui/dialog";
import { skipOption } from "./ui/skipped-confirms";

/**
 * What the public transport dialogs say, kept free of DOM so the tests can read it.
 * Strings come from the host's i18next, like the rest of the PT layer.
 */

export function deleteObsoleteSpec(name: string): ConfirmSpec {
  return {
    title: i18next.t("common:deleteObsoleteStop.title"),
    facts: [i18next.t("common:deleteObsoleteStop.message", { name })],
    confirmLabel: i18next.t("common:deleteObsoleteStop.confirm"),
    cancelLabel: i18next.t("common:deleteObsoleteStop.cancel"),
    danger: true,
    skip: skipOption("pt.deleteObsolete", i18next.t("common:dialogs.skip")),
  };
}

/** Values are the indexes into `names`, as strings. */
export function pickVenueSpec(names: string[]): ChoiceSpec<string> {
  return {
    title: i18next.t("common:venueMatchDialog.pickTitle"),
    facts: [i18next.t("common:venueMatchDialog.selectMessage")],
    choices: names.map((name, index) => ({
      value: String(index),
      label: name.trim() ? name : `#${index + 1}`,
    })),
    cancelLabel: i18next.t("common:venueMatchDialog.cancel"),
  };
}

export function mergeActionSpec(
  name: string,
  sameCoord: boolean,
): ChoiceSpec<"merge" | "merge-with-coords" | "save"> {
  const t = (key: string) => i18next.t(`common:venueMatchDialog.${key}`);
  const choices: ChoiceSpec<"merge" | "merge-with-coords" | "save">["choices"] =
    [{ value: "merge", label: t("merge"), description: t("mergeDescription") }];
  // Same point: nothing to move. "Save new" stays, stops can be stacked.
  if (!sameCoord) {
    choices.push({
      value: "merge-with-coords",
      label: t("mergeWithCoords"),
      description: t("mergeWithCoordsDescription"),
    });
  }
  choices.push({
    value: "save",
    label: t("saveNew"),
    description: t("saveNewDescription"),
  });
  return {
    title: t("mergeTitle"),
    facts: [
      name,
      i18next.t("common:venueMatchDialog.message", { venueCount: 1 }),
    ],
    choices,
    cancelLabel: t("cancel"),
  };
}
