import { log } from "./log";

/** Which families of UR the tab lists and puts in its batch. */
export interface Criteria {
  speedCamera: boolean;
  trafficLight: boolean;
  stale: boolean;
}

export interface Settings {
  version: 1;
  criteria: Criteria;
}

export const STORAGE_KEY = "wme-ch-speed-camera-urs.settings";

/**
 * Abandoned starts off: checking it reads the conversation of every old UR on screen, one
 * server round trip each, and widens a lot what a single click can close.
 */
export const DEFAULT_CRITERIA: Criteria = {
  speedCamera: true,
  trafficLight: true,
  stale: false,
};

export type SettingsStore = Pick<Storage, "getItem" | "setItem">;

/** Merely touching localStorage can throw (blocked site data, sandboxed frame). */
function browserStore(): SettingsStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Field by field, and only booleans: a value of the wrong type keeps its default, so a
 * damaged save can never switch the abandoned family on by itself.
 */
export function loadSettings(
  store: SettingsStore | null = browserStore(),
): Settings {
  const criteria = { ...DEFAULT_CRITERIA };
  let saved: unknown = null;
  try {
    const raw = store?.getItem(STORAGE_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch (err) {
    log.warn("Could not read the settings, using the defaults", err);
  }
  const savedCriteria =
    typeof saved === "object" && saved !== null
      ? (saved as { criteria?: Record<string, unknown> }).criteria
      : undefined;
  for (const key of Object.keys(criteria) as Array<keyof Criteria>) {
    const value = savedCriteria?.[key];
    if (typeof value === "boolean") criteria[key] = value;
  }
  return { version: 1, criteria };
}

/** A failed save only costs the choice at the next reload. */
export function saveSettings(
  settings: Settings,
  store: SettingsStore | null = browserStore(),
): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    log.warn("Could not save the settings", err);
  }
}
