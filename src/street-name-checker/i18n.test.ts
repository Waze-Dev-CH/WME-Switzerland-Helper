import { describe, expect, it } from "vitest";
import sharedI18n from "../../locales/i18n";
import { getLocale, resolveLocale, setLocale, t } from "./i18n";

describe("resolveLocale", () => {
  it("returns the explicit preference unchanged", () => {
    expect(resolveLocale("fr", "de-DE")).toBe("fr");
  });

  it("'auto' follows the WME locale prefix, falling back to English", () => {
    expect(resolveLocale("auto", "fr")).toBe("fr");
    expect(resolveLocale("auto", "de-CH")).toBe("de");
    expect(resolveLocale("auto", "es")).toBe("en");
  });
});

describe("t (i18next adapter)", () => {
  it("resolves a key in the active language and interpolates", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("fix")).toBe("Fix");
    expect(t("fixTitle", { name: "Rue X" })).toBe('Apply "Rue X"');
    setLocale("fr");
    expect(t("fix")).toBe("Corriger");
  });

  it("uses a dedicated instance: changing the checker locale leaves the host i18next untouched", () => {
    void sharedI18n.changeLanguage("en");
    setLocale("de");
    expect(getLocale()).toBe("de");
    // The host's PT-stop dialogs must not flip to the checker's language.
    expect(sharedI18n.language).toBe("en");
  });
});
