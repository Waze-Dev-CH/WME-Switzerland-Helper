import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import i18next from "../locales/i18n";
import {
  deleteObsoleteSpec,
  mergeActionSpec,
  pickVenueSpec,
} from "./publicTransportDialogs";
import { isConfirmSkipped } from "./ui/skipped-confirms";

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

  // The id is what the host tab's reset button clears: any other id would survive it.
  it("remembers the skip under pt.deleteObsolete", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });

    deleteObsoleteSpec("Bern, Bahnhof").skip?.remember();

    expect(isConfirmSkipped("pt.deleteObsolete")).toBe(true);
  });

  afterEach(() => vi.unstubAllGlobals());
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
