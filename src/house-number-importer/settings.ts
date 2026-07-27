import type { LanguagePreference } from "./i18n";
import { log } from "./log";
import type { MatchStrictness } from "./matching";

export interface Settings {
  version: 1;
  enabled: boolean;
  /** Below this zoom the layer stays empty and nothing is fetched. */
  minZoom: number;
  showMapLabels: boolean;
  /** Loose accepts a one or two character difference; matching.ts explains why it is off. */
  strictMatching: boolean;
  /** Drop addresses of buildings that are planned, authorized or under construction. */
  existingBuildingsOnly: boolean;
  confirmSingleImport: boolean;
  language: LanguagePreference;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  // Off on first run: the feature draws points over the map and talks to an external API,
  // so the editor turns it on deliberately.
  enabled: false,
  minZoom: 17,
  showMapLabels: true,
  strictMatching: true,
  existingBuildingsOnly: true,
  confirmSingleImport: false,
  language: "auto",
};

export function strictnessOf(settings: Settings): MatchStrictness {
  return settings.strictMatching ? "strict" : "loose";
}

const STORAGE_KEY = "wme-ch-hn-import.settings";

export function migrateSettings(
  parsed: Omit<Partial<Settings>, "version"> & { version?: number },
): Settings {
  // Every version merges over the defaults rather than resetting: a hard reset would throw
  // away the editor's preferences on a rollback from a future version, and unknown extra
  // fields are harmless.
  return { ...DEFAULT_SETTINGS, ...parsed, version: 1 };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return migrateSettings(JSON.parse(raw) as Partial<Settings>);
  } catch (err) {
    log.warn("Failed to load settings, using defaults", err);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    log.warn("Failed to save settings", err);
  }
}

/** Mutable settings holder shared across modules. */
export class SettingsStore {
  private settings: Settings;

  constructor() {
    this.settings = loadSettings();
  }

  get(): Settings {
    return this.settings;
  }

  update(partial: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...partial };
    saveSettings(this.settings);
    return this.settings;
  }
}
