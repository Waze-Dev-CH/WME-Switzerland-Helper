import { beforeAll, describe, expect, it } from "vitest";
import i18next from "../locales/i18n";
import {
  deleteObsoleteSpec,
  mergeActionSpec,
  pickVenueSpec,
} from "./publicTransportDialogs";

beforeAll(async () => {
  await i18next.changeLanguage("en");
});

function strings(spec: {
  title: string;
  facts: string[];
  confirmLabel?: string;
  cancelLabel: string;
  choices?: { label: string; description?: string }[];
}): string[] {
  return [
    spec.title,
    ...spec.facts,
    spec.confirmLabel ?? "",
    spec.cancelLabel,
    ...(spec.choices ?? []).flatMap((c) => [c.label, c.description ?? ""]),
  ];
}

describe("deleteObsoleteSpec", () => {
  it("is a danger confirmation with the pt.deleteObsolete skip box", () => {
    const spec = deleteObsoleteSpec("Bern, Bahnhof");
    expect(spec.danger).toBe(true);
    expect(spec.skip?.label).toBeTruthy();
    expect([spec.title, ...spec.facts].join("\n")).toContain("Bern, Bahnhof");
    expect(strings(spec).some((s) => s.includes("<"))).toBe(false);
  });
});

describe("mergeActionSpec", () => {
  it("offers merge and save when the stop is on the same point", () => {
    const spec = mergeActionSpec("Bern", true);
    expect(spec.choices.map((c) => c.value)).toEqual(["merge", "save"]);
  });

  it("offers merge, merge-with-coords and save otherwise, each described", () => {
    const spec = mergeActionSpec("Bern", false);
    expect(spec.choices.map((c) => c.value)).toEqual([
      "merge",
      "merge-with-coords",
      "save",
    ]);
    for (const choice of spec.choices) expect(choice.description).toBeTruthy();
    expect(strings(spec).some((s) => s.includes("<"))).toBe(false);
  });
});

describe("pickVenueSpec", () => {
  it("values are indexes and unnamed venues are labelled #i", () => {
    const spec = pickVenueSpec(["", "Bern"]);
    expect(spec.choices.map((c) => c.value)).toEqual(["0", "1"]);
    expect(spec.choices.map((c) => c.label)).toEqual(["#1", "Bern"]);
    expect(strings(spec).some((s) => s.includes("<"))).toBe(false);
  });
});
