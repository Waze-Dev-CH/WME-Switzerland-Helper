import type { WindowRect } from "./window-geometry";
import type { WindowMode, WindowStateStore } from "./window-mode";

/**
 * One localStorage entry for every panel that has no settings store of its own to hold its
 * window: `{ [panelId]: { mode, rect } }`. The street-name checker keeps its window in its
 * own settings, where it lived first.
 */
export const WINDOWS_KEY = "wme-ch-helper.windows";

type Saved = Record<string, { mode?: unknown; rect?: unknown }>;

/** Merely touching localStorage can throw (blocked site data, sandboxed frame). */
function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readAll(): Saved {
  try {
    const raw = storage()?.getItem(WINDOWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Saved)
      : {};
  } catch {
    return {};
  }
}

/** A failed save only costs the window's place at the next reload. */
function write(
  panelId: string,
  entry: { mode?: WindowMode; rect?: WindowRect },
): void {
  const all = readAll();
  all[panelId] = { ...all[panelId], ...entry };
  try {
    storage()?.setItem(WINDOWS_KEY, JSON.stringify(all));
  } catch {
    // Nothing to do: the panel works the same, it just opens docked next time.
  }
}

export function panelWindowStore(panelId: string): WindowStateStore {
  return {
    // Anything but the exact string is the sidebar: a damaged save never opens a window.
    getMode: () =>
      readAll()[panelId]?.mode === "floating" ? "floating" : "sidebar",
    setMode: (mode) => write(panelId, { mode }),
    getRect: () => readAll()[panelId]?.rect,
    setRect: (rect) => write(panelId, { rect }),
  };
}
