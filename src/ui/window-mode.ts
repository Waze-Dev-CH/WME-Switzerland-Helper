import { FloatingWindow, openWindowCount, type FloatingWindowOptions } from "./floating-window";
import { clampRect, defaultRect, isWindowRect, type WindowRect } from "./window-geometry";

/** Sidebar tab, or a floating window that survives WME's tab switching. */
export type WindowMode = "sidebar" | "floating";

/** Where a panel keeps its mode and its window's geometry. */
export interface WindowStateStore {
  getMode(): WindowMode;
  setMode(mode: WindowMode): void;
  /** Whatever was saved, checked by isWindowRect before use: storage can be hand-edited. */
  getRect(): unknown;
  setRect(rect: WindowRect): void;
}

export interface WindowModeOptions {
  store: WindowStateStore;
  /** Read at each detach, so a language change since the last one is picked up. */
  labels: () => Omit<FloatingWindowOptions, "onGeometry" | "onDock">;
  /** Move the panel into the window body. Called after the mode is saved as floating. */
  onDetach: (body: HTMLElement) => void;
  /** Move it back into the sidebar. Called after the mode is saved as sidebar. */
  onDock: () => void;
}

export interface WindowModeController {
  /** Apply the persisted mode once the panel is built. */
  restore(): void;
  detach(): void;
  dock(): void;
  toggle(): void;
  isDetached(): boolean;
}

/**
 * Arbitrates the two homes of a panel: the sidebar tab and the floating window. A single
 * place to go through, with the store as the persisted truth, so the entry points (the
 * Detach button, the window's Dock button, the keyboard shortcut) can never disagree.
 */
export function createWindowMode(options: WindowModeOptions): WindowModeController {
  const { store } = options;
  let current: FloatingWindow | null = null;
  let onViewportResize: (() => void) | null = null;

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  /** Stored geometry, brought back on screen: the browser may have shrunk since. */
  const startingRect = (): WindowRect => {
    const stored = store.getRect();
    return isWindowRect(stored)
      ? clampRect(stored, viewport())
      : defaultRect(viewport(), openWindowCount());
  };

  const dock = (): void => {
    if (!current) return;
    current.destroy();
    current = null;
    if (onViewportResize) {
      window.removeEventListener("resize", onViewportResize);
      onViewportResize = null;
    }
    store.setMode("sidebar");
    options.onDock();
  };

  const detach = (): void => {
    if (current) return;
    const win = new FloatingWindow(startingRect(), {
      ...options.labels(),
      onGeometry: (rect) => store.setRect(rect),
      onDock: () => dock(),
    });
    win.mount();
    current = win;
    // Saved before the move: a panel may read the mode while rebuilding, to leave out the
    // Detach button, which has no place once the window is open.
    store.setMode("floating");
    options.onDetach(win.body());

    onViewportResize = () => win.reclamp();
    window.addEventListener("resize", onViewportResize);
  };

  return {
    restore: () => {
      if (store.getMode() === "floating") detach();
    },
    detach,
    dock,
    toggle: () => (current ? dock() : detach()),
    isDetached: () => current !== null,
  };
}
