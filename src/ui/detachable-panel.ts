import { button, el, icon } from "./dom";
import { panelWindowStore } from "./window-state";
import {
  createWindowMode,
  type WindowModeController,
  type WindowStateStore,
} from "./window-mode";

export interface DetachedLabels {
  title: string;
  dock: string;
  dockTitle: string;
  /** Shown in the sidebar tab while the panel sits in its window. */
  detachedNote: string;
}

export interface DetachablePanelOptions {
  /** Storage key and window id; one per panel. */
  panelId: string;
  /** The SDK's sidebar pane: the panel's home when docked, and the theme probe always. */
  sidebar: HTMLElement;
  /** CSS prefix of the feature ("hn", "scu"), so the note uses its tokens and buttons. */
  prefix: string;
  icon: string;
  /** Read at each move, so a language change since the last one is picked up. */
  labels: () => DetachedLabels;
  /** Told after every move, so the panel can hide its Detach button while floating. */
  onModeChange?: (detached: boolean) => void;
  /** Tests only; the browser uses the shared localStorage entry. */
  store?: WindowStateStore;
}

/**
 * A whole panel that can leave the sidebar for a floating window and come back.
 *
 * The panel's root element is MOVED, never rebuilt: its open sections, scroll position and
 * listeners travel with it. While it is away, the sidebar tab holds a short note and a way
 * back, so an editor who opens the tab is never left facing an empty pane.
 *
 * The street-name checker does not use this: it splits its panel, the list in the window
 * and the options in the sidebar, and drives createWindowMode itself.
 */
export class DetachablePanel {
  private content: HTMLElement | null = null;
  /** The window's body while detached, null while docked. */
  private body: HTMLElement | null = null;
  private mode: WindowModeController;

  constructor(private options: DetachablePanelOptions) {
    this.mode = createWindowMode({
      store: options.store ?? panelWindowStore(options.panelId),
      labels: () => {
        const labels = options.labels();
        return {
          id: `wmech-window-${options.panelId}`,
          icon: options.icon,
          title: labels.title,
          dockLabel: labels.dock,
          dockTitle: labels.dockTitle,
        };
      },
      onDetach: (body) => {
        this.body = body;
        this.place();
        options.onModeChange?.(true);
      },
      onDock: () => {
        this.body = null;
        this.place();
        options.onModeChange?.(false);
      },
    });
  }

  /**
   * Install the panel's root, or replace it after a full rebuild (a language change). It
   * goes wherever the panel currently lives.
   */
  show(content: HTMLElement): void {
    this.content = content;
    this.place();
  }

  private place(): void {
    const content = this.content ? [this.content] : [];
    if (!this.body) {
      this.options.sidebar.replaceChildren(...content);
      return;
    }
    this.body.replaceChildren(...content);
    this.options.sidebar.replaceChildren(this.note());
  }

  /** Apply the saved mode; call once the panel has been shown. */
  restore(): void {
    this.mode.restore();
  }

  detach(): void {
    this.mode.detach();
  }

  toggle(): void {
    this.mode.toggle();
  }

  isDetached(): boolean {
    return this.mode.isDetached();
  }

  private note(): HTMLElement {
    const labels = this.options.labels();
    const prefix = this.options.prefix;
    const note = el("div", `${prefix}-pane ${prefix}-detached`);
    const text = el("div", `${prefix}-note`);
    text.append(
      icon(this.options.icon),
      el("span", "", ` ${labels.detachedNote}`),
    );
    const back = button(labels.dock, () => this.mode.dock(), `${prefix}-btn`);
    back.title = labels.dockTitle;
    note.append(text, back);
    return note;
  }
}
