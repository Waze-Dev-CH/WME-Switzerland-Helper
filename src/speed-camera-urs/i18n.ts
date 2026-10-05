/**
 * i18n for the speed-camera URs. Strings live in `locales/<lang>/common.json` under the
 * `speedCameraUrs` key.
 *
 * A dedicated i18next instance, like the two other features: their language preferences
 * are per feature, and sharing the host singleton would let one flip the others.
 *
 * Two kinds of strings live here. The UI follows the editor's WME language (`t`); the
 * message sent to a reporter follows the REPORTER's language (`tIn`), whatever the UI shows.
 */
import i18next from "i18next";
import deCommon from "../../locales/de/common.json";
import enCommon from "../../locales/en/common.json";
import frCommon from "../../locales/fr/common.json";
import itCommon from "../../locales/it/common.json";

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
  // Everything goes to textContent or to a UR comment, so i18next's HTML escaping would be
  // shown verbatim ("l&#39;UR") instead of being applied.
  interpolation: { escapeValue: false },
});

export type LocaleCode = "en" | "fr" | "de" | "it";

/** Keys of the `speedCameraUrs` section, derived from the English source. */
export type StringKey = keyof (typeof enCommon)["speedCameraUrs"];

const SUPPORTED: readonly LocaleCode[] = ["en", "fr", "de", "it"];

/** A WME locale code ("fr-CH", "de") reduced to one of ours; anything else is English. */
export function normalizeLocale(code: string | undefined): LocaleCode {
  const prefix = (code ?? "en").toLowerCase().slice(0, 2);
  return (SUPPORTED as readonly string[]).includes(prefix)
    ? (prefix as LocaleCode)
    : "en";
}

export function setLocale(code: LocaleCode): void {
  void i18n.changeLanguage(code);
}

export function getLocale(): LocaleCode {
  return normalizeLocale(i18n.language);
}

export function t(
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  // Explicit `common:` namespace: the init above does not set a defaultNS.
  return i18n.t(`common:speedCameraUrs.${key}`, params) as string;
}

export function tIn(
  lng: LocaleCode,
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  return i18n.t(`common:speedCameraUrs.${key}`, { ...params, lng }) as string;
}
