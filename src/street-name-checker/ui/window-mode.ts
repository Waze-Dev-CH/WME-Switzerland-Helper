import { t } from "../i18n";
import type { SettingsStore } from "../settings";
import { el } from "./dom";
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
    tab.remountInto(tab.sidebarPane());
  };

  /** What the sidebar tab shows while the content lives in the window. */
  const showDetachedNotice = (): void => {
    const pane = tab.sidebarPane();
    pane.replaceChildren();
    pane.classList.add("chk-pane");
    const notice = el("div", "chk-note", t("detachedNotice"));
    const dockBtn = el("button", "chk-btn", t("dock"));
    dockBtn.title = t("dockTitle");
    dockBtn.addEventListener("click", () => dock());
    pane.append(notice, dockBtn);
  };

  const detach = (): void => {
    if (current) return;
    const win = new FloatingWindow(startingRect(), settings.get().windowMinimized, {
      onGeometry: (rect) => settings.update({ windowRect: rect }),
      onMinimize: (minimized) => settings.update({ windowMinimized: minimized }),
      onDock: () => dock(),
    });
    win.mount();
    current = win;
    // Written before remounting: buildSkeleton reads windowMode to decide whether to
    // offer the Detach button, and it must not offer it inside the window.
    settings.update({ windowMode: "floating" });
    tab.remountInto(win.body());
    showDetachedNotice();

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
