import type { SettingsStore } from "../settings";
import { FloatingWindow } from "./floating-window";
import type { TabUI } from "./tab";
import { clampRect, defaultRect, isWindowRect, type WindowRect } from "./window-geometry";

export interface WindowModeController {
  /** Apply the persisted mode once the tab is built. */
  restore(): void;
  detach(): void;
  dock(): void;
  toggle(): void;
}

/**
 * Arbitrates the two homes of the checker UI: the sidebar tab and the floating window.
 * Same shape as activation.ts for the on/off switch, a single place to go through with
 * settings as the persisted truth, so the entry points (the Detach button, the window's
 * own Dock button, the keyboard shortcut) can never disagree.
 */
export function createWindowMode(settings: SettingsStore, tab: TabUI): WindowModeController {
  let current: FloatingWindow | null = null;
  let onViewportResize: (() => void) | null = null;

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  /** Stored geometry, brought back on screen: the browser may have shrunk since. */
  const startingRect = (): WindowRect => {
    const stored = settings.get().windowRect;
    return isWindowRect(stored) ? clampRect(stored, viewport()) : defaultRect(viewport());
  };

  const dock = (): void => {
    if (!current) return;
    current.destroy();
    current = null;
    if (onViewportResize) {
      window.removeEventListener("resize", onViewportResize);
      onViewportResize = null;
    }
    settings.update({ windowMode: "sidebar" });
    tab.setContainers(tab.sidebarPane(), tab.sidebarPane());
  };

  const detach = (): void => {
    if (current) return;
    const win = new FloatingWindow(startingRect(), {
      onGeometry: (rect) => settings.update({ windowRect: rect }),
      onDock: () => dock(),
    });
    win.mount();
    current = win;
    // Written before the remount: buildSkeleton reads windowMode to decide whether to
    // offer the Detach button, which has no place once the window is already open.
    settings.update({ windowMode: "floating" });
    // Working surface into the window, options left in the sidebar tab.
    tab.setContainers(win.body(), tab.sidebarPane());

    onViewportResize = () => win.reclamp();
    window.addEventListener("resize", onViewportResize);
  };

  return {
    restore: () => {
      if (settings.get().windowMode === "floating") detach();
    },
    detach,
    dock,
    toggle: () => (current ? dock() : detach()),
  };
}
