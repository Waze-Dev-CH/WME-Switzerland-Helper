/**
 * i18n for the street-name checker, delegating to the host repo's shared i18next
 * instance. Our strings live in `locales/<lang>/common.json` under the `streetCheck`
 * key; this module keeps the small typed `t()` / locale helpers the feature uses so
 * call sites stay unchanged.
 */
import i18next from "../../locales/i18n";
import enCommon from "../../locales/en/common.json";

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
  void i18next.changeLanguage(code);
}

export function getLocale(): LocaleCode {
  return normalize(i18next.language);
}

/** "auto" follows the WME UI locale; unsupported locales fall back to English. */
export function resolveLocale(preference: LanguagePreference, wmeLocaleCode: string): LocaleCode {
  if (preference !== "auto") return preference;
  return normalize(wmeLocaleCode);
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  // Explicit `common:` namespace — the host i18next init does not set a defaultNS.
  return i18next.t(`common:streetCheck.${key}`, params) as string;
}
