import { describe, expect, it } from "vitest";
import deCommon from "../../locales/de/common.json";
import enCommon from "../../locales/en/common.json";
import frCommon from "../../locales/fr/common.json";
import itCommon from "../../locales/it/common.json";
import { normalizeLocale, t, tIn } from "./i18n";

const CATALOGS = { fr: frCommon, de: deCommon, it: itCommon };

describe("speedCameraUrs catalogs", () => {
  const expected = Object.keys(enCommon.speedCameraUrs).sort();

  it.each(Object.keys(CATALOGS))(
    "%s carries exactly the English keys",
    (locale) => {
      // A missing key falls back to English silently, so only a test catches it.
      const catalog = CATALOGS[locale as keyof typeof CATALOGS];
      expect(Object.keys(catalog.speedCameraUrs).sort()).toEqual(expected);
    },
  );

  it.each(Object.keys(CATALOGS))(
    "%s translates the strings rather than copying them",
    (locale) => {
      const catalog = CATALOGS[locale as keyof typeof CATALOGS];
      const english = enCommon.speedCameraUrs as Record<string, string>;
      const translated = catalog.speedCameraUrs as Record<string, string>;
      // "OK" is legitimately identical in all four languages; nothing else should be.
      const copied = expected.filter(
        (key) => key !== "dialogOk" && translated[key] === english[key],
      );
      expect(copied).toEqual([]);
    },
  );

  it("keeps the interpolation placeholders of every language", () => {
    const english = enCommon.speedCameraUrs as Record<string, string>;
    for (const key of expected) {
      const placeholders = [...(english[key] ?? "").matchAll(/{{(\w+)}}/g)]
        .map((m) => m[1])
        .sort();
      for (const [locale, catalog] of Object.entries(CATALOGS)) {
        const value =
          (catalog.speedCameraUrs as Record<string, string>)[key] ?? "";
        const found = [...value.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
        expect(found, `${locale}.${key}`).toEqual(placeholders);
      }
    }
  });

  it("writes Swiss German, without the sharp s", () => {
    const values = Object.values(
      deCommon.speedCameraUrs as Record<string, string>,
    );
    expect(values.filter((value) => value.includes("ß"))).toEqual([]);
  });
});

describe("t and tIn", () => {
  it("resolves a key in the UI language", () => {
    expect(t("appName")).toBe(enCommon.speedCameraUrs.appName);
  });

  it("resolves a key in another language without changing the UI language", () => {
    expect(tIn("de", "appName")).toBe(deCommon.speedCameraUrs.appName);
    expect(t("appName")).toBe(enCommon.speedCameraUrs.appName);
  });
});

describe("normalizeLocale", () => {
  it("keeps the four supported languages and falls back to English", () => {
    expect(normalizeLocale("fr-CH")).toBe("fr");
    expect(normalizeLocale("de")).toBe("de");
    expect(normalizeLocale("pt-BR")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});
