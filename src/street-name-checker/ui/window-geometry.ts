/**
 * Pure geometry for the floating window. No DOM, so the parts that are easy to get
 * wrong stay unit-tested: the repo has no DOM test environment, and the window shell
 * itself cannot be covered.
 */

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 220;

/**
 * How much of the title bar must stay on screen. Without this the window can be pushed
 * past the bottom edge and becomes impossible to grab again, since dragging is only
 * possible by the bar.
 */
export const TITLE_BAR_GRAB_PX = 30;

export const DEFAULT_SIZE = { w: 460, h: 560 };

/** Starting position: right-hand side, clear of WME's own toolbars. */
export function defaultRect(viewport: Viewport): WindowRect {
  const w = Math.min(DEFAULT_SIZE.w, Math.max(MIN_WIDTH, viewport.width - 40));
  const h = Math.min(DEFAULT_SIZE.h, Math.max(MIN_HEIGHT, viewport.height - 120));
  return clampRect({ x: viewport.width - w - 60, y: 60, w, h }, viewport);
}

/**
 * Bring a rect back on screen. Applied both when restoring a saved position (the browser
 * window may have shrunk since) and on every drag step.
 *
 * The size is capped to the viewport before the position, so a window saved on a large
 * screen and reopened on a small one stays usable rather than merely visible.
 */
export function clampRect(rect: WindowRect, viewport: Viewport): WindowRect {
  const w = Math.max(MIN_WIDTH, Math.min(rect.w, viewport.width));
  const h = Math.max(MIN_HEIGHT, Math.min(rect.h, viewport.height));

  const maxX = Math.max(0, viewport.width - w);
  // The body may overflow the bottom edge, the title bar may not: it is the only
  // way to drag the window back.
  const maxY = Math.max(0, viewport.height - TITLE_BAR_GRAB_PX);

  return {
    x: Math.max(0, Math.min(rect.x, maxX)),
    y: Math.max(0, Math.min(rect.y, maxY)),
    w,
    h,
  };
}

/**
 * Position of a window being dragged. `grab` is the pointer offset inside the title bar,
 * captured on pointerdown, so the window does not jump under the cursor.
 */
export function dragTo(
  rect: WindowRect,
  grab: { dx: number; dy: number },
  pointer: { x: number; y: number },
  viewport: Viewport,
): WindowRect {
  return clampRect({ ...rect, x: pointer.x - grab.dx, y: pointer.y - grab.dy }, viewport);
}

/** True when a stored rect is structurally usable; guards against a hand-edited blob. */
export function isWindowRect(value: unknown): value is WindowRect {
  if (typeof value !== "object" || value === null) return false;
  const rect = value as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (key) => typeof rect[key] === "number" && Number.isFinite(rect[key]),
  );
}
