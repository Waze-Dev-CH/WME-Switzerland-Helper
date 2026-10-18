import { el, icon } from "./dom";
import { injectStyleOnce } from "./inject";
import { tokenRules } from "./tokens";
import {
  clampRect,
  dragTo,
  MIN_HEIGHT,
  MIN_WIDTH,
  type Viewport,
  type WindowRect,
} from "./window-geometry";

export interface FloatingWindowOptions {
  /** DOM id, one per panel, so two features never share a window. */
  id: string;
  /** Icon name and title shown in the bar; labels come from the caller's own i18n. */
  icon: string;
  title: string;
  dockLabel: string;
  dockTitle: string;
  /** Fired once a drag or a resize settles, with the geometry to persist. */
  onGeometry: (rect: WindowRect) => void;
  /** Put the content back into the sidebar tab. */
  onDock: () => void;
}

/**
 * Below the shared dialogs' 10000, so a confirmation always lands on top of a window. The
 * window last touched gets one more, which is all the stacking two or three windows need.
 */
const Z_BACK = 9000;
const Z_FRONT = 9001;

const open = new Set<FloatingWindow>();

/** How many windows are open now: a new one cascades from the others (defaultRect). */
export function openWindowCount(): number {
  return open.size;
}

const CSS = `
${tokenRules("wmech", [".wmech-window"])}
.wmech-window {
  position: fixed;
  z-index: ${Z_BACK};
  display: flex;
  flex-direction: column;
  min-width: ${MIN_WIDTH}px;
  min-height: ${MIN_HEIGHT}px;
  resize: both;
  overflow: hidden;
  font-family: var(--wmech-font);
  background: var(--wmech-bg);
  color: var(--wmech-text);
  border: 1px solid var(--wmech-border);
  border-radius: var(--wmech-radius);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
}
.wmech-window-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--wmech-surface);
  border-bottom: 1px solid var(--wmech-border);
  cursor: move;
  user-select: none;
  flex: 0 0 auto;
  touch-action: none;
}
.wmech-window-title { flex: 1; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; }
.wmech-window-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--wmech-border);
  background: var(--wmech-bg);
  color: var(--wmech-text);
  border-radius: 4px;
  height: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 8px;
  font-size: 12px;
  white-space: nowrap;
}
.wmech-window-btn:hover { background: var(--wmech-surface); }
/* min-height:0 lets the inner flex column actually shrink instead of overflowing. */
.wmech-window-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
`;

/**
 * Draggable, resizable window holding one panel of the script.
 *
 * DELIBERATE deviation from CLAUDE.md "no direct DOM hacks that bypass SDK events", listed
 * in the deviations table. The WME SDK has exactly two UI extension points, the sidebar
 * script tab and the layer-switcher checkbox (verified against wme-sdk-typings), and no way
 * to keep a script tab visible once WME switches to its Selection panel on a click on the
 * map. That switch is the whole reason this window exists.
 *
 * Containment: the window only hosts DOM the panel already builds, and every scan,
 * selection and edit still goes through SDK events. It is anchored to document.body and
 * matches no WME selector, so a WME layout change cannot break it.
 */
export class FloatingWindow {
  private root: HTMLElement;
  private bar: HTMLElement;
  private content: HTMLElement;
  private rect: WindowRect;
  private resizeObserver: ResizeObserver | null = null;
  /** Set while dragging, so the ResizeObserver does not fight the drag. */
  private dragging = false;

  constructor(
    rect: WindowRect,
    private options: FloatingWindowOptions,
  ) {
    injectStyleOnce("floating-window", CSS);
    this.rect = rect;

    this.root = el("div", "wmech-window");
    this.root.id = options.id;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", options.title);

    this.bar = el("div", "wmech-window-bar");
    const title = el("span", "wmech-window-title");
    title.append(icon(options.icon), el("span", "", options.title));

    // Spelled out rather than a glyph: this is the way back to the sidebar, and it is the
    // only control the window carries. The icon accompanies the label, never replaces it.
    const dockBtn = el("button", "wmech-window-btn");
    dockBtn.append(icon("undo"), el("span", "", options.dockLabel));
    dockBtn.type = "button";
    dockBtn.title = options.dockTitle;
    dockBtn.addEventListener("click", () => this.options.onDock());

    this.bar.append(title, dockBtn);
    this.content = el("div", "wmech-window-content");
    this.root.append(this.bar, this.content);
    // Capture phase: a click anywhere inside raises the window, even on a button that
    // stops the event further down.
    this.root.addEventListener("pointerdown", () => this.raise(), true);

    this.applyRect();
    this.installDrag();
  }

  /** The element the panel content is mounted into. */
  body(): HTMLElement {
    return this.content;
  }

  mount(): void {
    document.body.appendChild(this.root);
    open.add(this);
    this.raise();
    this.observeResize();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    open.delete(this);
    this.root.remove();
  }

  private raise(): void {
    for (const win of open) win.root.style.zIndex = String(Z_BACK);
    this.root.style.zIndex = String(Z_FRONT);
  }

  private viewport(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  /**
   * Position is always expressed with left/top, never right/bottom: mixing the two
   * anchors leaves the window stretched between them the first time it is dragged.
   */
  private applyRect(): void {
    this.root.style.left = `${this.rect.x}px`;
    this.root.style.top = `${this.rect.y}px`;
    this.root.style.width = `${this.rect.w}px`;
    this.root.style.height = `${this.rect.h}px`;
  }

  /** Re-clamp after the browser window changed size. */
  reclamp(): void {
    this.rect = clampRect(this.rect, this.viewport());
    this.applyRect();
    this.options.onGeometry(this.rect);
  }

  private installDrag(): void {
    this.bar.addEventListener("pointerdown", (event: PointerEvent) => {
      // Clicking Dock must not start a drag.
      if ((event.target as HTMLElement).closest("button")) return;
      if (event.button !== 0) return;

      const grab = { dx: event.clientX - this.rect.x, dy: event.clientY - this.rect.y };
      this.dragging = true;
      this.bar.setPointerCapture(event.pointerId);
      event.preventDefault();

      const move = (moveEvent: PointerEvent) => {
        this.rect = dragTo(
          this.rect,
          grab,
          { x: moveEvent.clientX, y: moveEvent.clientY },
          this.viewport(),
        );
        this.applyRect();
      };
      const end = () => {
        this.dragging = false;
        this.bar.removeEventListener("pointermove", move);
        this.bar.removeEventListener("pointerup", end);
        this.bar.removeEventListener("pointercancel", end);
        this.options.onGeometry(this.rect);
      };

      // Bound to the bar rather than the document: pointer capture routes the events
      // here even when the cursor leaves the window, and nothing global is left behind.
      this.bar.addEventListener("pointermove", move);
      this.bar.addEventListener("pointerup", end);
      this.bar.addEventListener("pointercancel", end);
    });
  }

  /** CSS `resize: both` does the resizing; this only records the result. */
  private observeResize(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.dragging) return;
      const w = Math.max(MIN_WIDTH, this.root.offsetWidth);
      const h = Math.max(MIN_HEIGHT, this.root.offsetHeight);
      if (w === this.rect.w && h === this.rect.h) return;
      this.rect = { ...this.rect, w, h };
      this.options.onGeometry(this.rect);
    });
    this.resizeObserver.observe(this.root);
  }
}
