import { t } from "../i18n";
import { el } from "./dom";
import {
  clampRect,
  dragTo,
  MIN_HEIGHT,
  MIN_WIDTH,
  type Viewport,
  type WindowRect,
} from "./window-geometry";

export interface FloatingWindowCallbacks {
  /** Fired once a drag or a resize settles, with the geometry to persist. */
  onGeometry: (rect: WindowRect) => void;
  /** Put the content back into the sidebar tab. */
  onDock: () => void;
}

const CONTAINER_ID = "chk-window";

/**
 * Draggable, resizable window holding the checker's UI.
 *
 * DELIBERATE deviation from CLAUDE.md "no direct DOM hacks that bypass SDK events", the
 * second one after ui/edit-panel.ts and listed in the deviations table. The WME SDK has
 * exactly two UI extension points, the sidebar script tab and the layer-switcher checkbox
 * (verified against wme-sdk-typings), and no way to keep the script tab visible once WME
 * switches to its Selection panel on segment click. That switch is the whole reason this
 * window exists.
 *
 * Containment: the window only hosts DOM the tab already builds, and every scan,
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
    private callbacks: FloatingWindowCallbacks,
  ) {
    this.rect = rect;

    this.root = el("div", "chk-window");
    this.root.id = CONTAINER_ID;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", t("appName"));

    this.bar = el("div", "chk-window-bar");
    const title = el("span", "chk-window-title", `🛣️ ${t("appName")}`);

    // Spelled out rather than a glyph: this is the way back to the sidebar, and it is
    // the only control the window carries.
    const dockBtn = el("button", "chk-window-btn", t("dock"));
    dockBtn.type = "button";
    dockBtn.title = t("dockTitle");
    dockBtn.addEventListener("click", () => this.callbacks.onDock());

    this.bar.append(title, dockBtn);
    this.content = el("div", "chk-window-content");
    this.root.append(this.bar, this.content);

    this.applyRect();
    this.installDrag();
  }

  /** The element the tab content is mounted into. */
  body(): HTMLElement {
    return this.content;
  }

  mount(): void {
    document.body.appendChild(this.root);
    this.observeResize();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.root.remove();
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
    this.callbacks.onGeometry(this.rect);
  }

  private installDrag(): void {
    this.bar.addEventListener("pointerdown", (event: PointerEvent) => {
      // Clicking minimize or dock must not start a drag.
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
        this.callbacks.onGeometry(this.rect);
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
      this.callbacks.onGeometry(this.rect);
    });
    this.resizeObserver.observe(this.root);
  }
}
