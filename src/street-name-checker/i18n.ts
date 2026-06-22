/**
 * i18n for the street-name checker. Strings live in `locales/<lang>/common.json`
 * under the `streetCheck` key; this module keeps the small typed `t()` / locale
 * helpers the feature uses so call sites stay unchanged.
 *
 * The checker owns a DEDICATED i18next instance (sharing the same resources as the
 * host) rather than the shared singleton: its language is a per-feature preference,
 * so changing it here must not flip the host's PT-stop dialogs (and vice-versa).
 */
import i18next from "i18next";
import enCommon from "../../locales/en/common.json";
import frCommon from "../../locales/fr/common.json";
import itCommon from "../../locales/it/common.json";
import deCommon from "../../locales/de/common.json";

const i18n = i18next.createInstance();
void i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: { common: enCommon },
    fr: { common: frCommon },
    it: { common: itCommon },
    de: { common: deCommon },
  },
});

export type LocaleCode = "en" | "fr" | "de" | "it";
export type LanguagePreference = "auto" | LocaleCode;

/** Keys of the `streetCheck` namespace section, derived from the English source. */
export type StringKey = keyof (typeof enCommon)["streetCheck"];

export const LANGUAGE_CHOICES: Array<{ value: LanguagePreference; label: string }> = [
  { value: "auto", label: "Auto (WME)" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
];

const SUPPORTED: readonly LocaleCode[] = ["en", "fr", "de", "it"];

function normalize(code: string | undefined): LocaleCode {
  const prefix = (code ?? "en").toLowerCase().slice(0, 2);
  return (SUPPORTED as readonly string[]).includes(prefix) ? (prefix as LocaleCode) : "en";
}

export function setLocale(code: LocaleCode): void {
  void i18n.changeLanguage(code);
}

export function getLocale(): LocaleCode {
  return normalize(i18n.language);
}

/** "auto" follows the WME UI locale; unsupported locales fall back to English. */
export function resolveLocale(preference: LanguagePreference, wmeLocaleCode: string): LocaleCode {
  if (preference !== "auto") return preference;
  return normalize(wmeLocaleCode);
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  // Explicit `common:` namespace — the init above does not set a defaultNS.
  return i18n.t(`common:streetCheck.${key}`, params) as string;
}
