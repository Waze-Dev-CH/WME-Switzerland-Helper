import { describe, expect, it } from "vitest";
import deCommon from "../../locales/de/common.json";
import enCommon from "../../locales/en/common.json";
import frCommon from "../../locales/fr/common.json";
import itCommon from "../../locales/it/common.json";
import { t } from "./i18n";

const CATALOGS = { fr: frCommon, de: deCommon, it: itCommon };

describe("hnImport catalogs", () => {
  const expected = Object.keys(enCommon.hnImport).sort();

  it.each(Object.keys(CATALOGS))("%s carries exactly the English keys", (locale) => {
    // A missing key falls back to English silently, so only a test catches it.
    const catalog = CATALOGS[locale as keyof typeof CATALOGS];
    expect(Object.keys(catalog.hnImport).sort()).toEqual(expected);
  });

  it.each(Object.keys(CATALOGS))("%s translates the strings rather than copying them", (locale) => {
    const catalog = CATALOGS[locale as keyof typeof CATALOGS];
    const english = enCommon.hnImport as Record<string, string>;
    const translated = catalog.hnImport as Record<string, string>;
    // "OK" is legitimately identical in all four languages; nothing else should be.
    const copied = expected.filter((key) => key !== "dialogOk" && translated[key] === english[key]);
    expect(copied).toEqual([]);
  });

  it("keeps the interpolation placeholders of every language", () => {
    const english = enCommon.hnImport as Record<string, string>;
    for (const key of expected) {
      const placeholders = [...(english[key] ?? "").matchAll(/{{(\w+)}}/g)]
        .map((m) => m[1])
        .sort();
      for (const [locale, catalog] of Object.entries(CATALOGS)) {
        const value = (catalog.hnImport as Record<string, string>)[key] ?? "";
        const found = [...value.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
        expect(found, `${locale}.${key}`).toEqual(placeholders);
      }
    }
  });
});

describe("t", () => {
  it("resolves a key from the hnImport namespace", () => {
    expect(t("appName")).toBe(enCommon.hnImport.appName);
  });

  it("interpolates parameters", () => {
    expect(t("countGwr", { count: 42 })).toContain("42");
  });
});
