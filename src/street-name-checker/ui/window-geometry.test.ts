import { describe, expect, it } from "vitest";
import {
  clampRect,
  defaultRect,
  dragTo,
  isWindowRect,
  MIN_HEIGHT,
  MIN_WIDTH,
  TITLE_BAR_GRAB_PX,
  type WindowRect,
} from "./window-geometry";

const SCREEN = { width: 1920, height: 1080 };
const rect = (over: Partial<WindowRect> = {}): WindowRect => ({
  x: 100,
  y: 100,
  w: 460,
  h: 560,
  ...over,
});

describe("clampRect", () => {
  it("leaves a window that already fits alone", () => {
    const r = rect();
    expect(clampRect(r, SCREEN)).toEqual(r);
  });

  it("pulls back a window pushed past the right edge", () => {
    const clamped = clampRect(rect({ x: 5000 }), SCREEN);
    expect(clamped.x).toBe(SCREEN.width - 460);
    expect(clamped.w).toBe(460);
  });

  it("keeps the title bar reachable when pushed past the bottom", () => {
    // The whole point: the window is only draggable by its bar, so a bar below the
    // bottom edge would strand the window for good.
    const clamped = clampRect(rect({ y: 5000 }), SCREEN);
    expect(clamped.y).toBe(SCREEN.height - TITLE_BAR_GRAB_PX);
  });

  it("never yields negative coordinates", () => {
    const clamped = clampRect(rect({ x: -400, y: -400 }), SCREEN);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it("shrinks a window wider or taller than the screen", () => {
    const clamped = clampRect(rect({ w: 4000, h: 4000 }), SCREEN);
    expect(clamped.w).toBe(SCREEN.width);
    expect(clamped.h).toBe(SCREEN.height);
  });

  it("restores a window saved on a big screen onto a small one", () => {
    // Saved bottom-right of a 1920x1080 desktop, reopened on a laptop.
    const saved = rect({ x: 1500, y: 900, w: 460, h: 560 });
    const small = { width: 800, height: 600 };
    const clamped = clampRect(saved, small);
    expect(clamped.x).toBeLessThanOrEqual(small.width - clamped.w);
    expect(clamped.y).toBeLessThanOrEqual(small.height - TITLE_BAR_GRAB_PX);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it("never goes below the minimum usable size", () => {
    const tiny = clampRect(rect({ w: 10, h: 10 }), SCREEN);
    expect(tiny.w).toBe(MIN_WIDTH);
    expect(tiny.h).toBe(MIN_HEIGHT);
  });

  it("keeps the window reachable when the viewport is smaller than the minimum size", () => {
    // The window cannot shrink below MIN_WIDTH, so it overflows a 200px viewport. What
    // must hold is that it stays anchored on screen and the bar stays grabbable, not
    // that it gets pinned to a corner.
    const viewport = { width: 200, height: 150 };
    const clamped = clampRect(rect(), viewport);
    expect(clamped.x).toBe(0); // wider than the screen: flush left, nothing better to do
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeLessThanOrEqual(viewport.height - TITLE_BAR_GRAB_PX);
  });
});

describe("dragTo", () => {
  it("follows the pointer, keeping the grab offset", () => {
    const moved = dragTo(rect({ x: 100, y: 100 }), { dx: 20, dy: 10 }, { x: 500, y: 300 }, SCREEN);
    expect(moved).toMatchObject({ x: 480, y: 290, w: 460, h: 560 });
  });

  it("stops at the edges instead of following the pointer off screen", () => {
    const moved = dragTo(rect(), { dx: 0, dy: 0 }, { x: 9999, y: 9999 }, SCREEN);
    expect(moved.x).toBe(SCREEN.width - 460);
    expect(moved.y).toBe(SCREEN.height - TITLE_BAR_GRAB_PX);
  });

  it("does not resize while dragging", () => {
    const moved = dragTo(rect(), { dx: 5, dy: 5 }, { x: 0, y: 0 }, SCREEN);
    expect(moved.w).toBe(460);
    expect(moved.h).toBe(560);
  });
});

describe("defaultRect", () => {
  it("opens fully on screen", () => {
    const r = defaultRect(SCREEN);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(SCREEN.width);
  });

  it("still fits on a small screen", () => {
    const small = { width: 700, height: 500 };
    const r = defaultRect(small);
    expect(r.w).toBeLessThanOrEqual(small.width);
    expect(r.x).toBeGreaterThanOrEqual(0);
  });
});

describe("isWindowRect", () => {
  it("accepts a well-formed rect", () => {
    expect(isWindowRect({ x: 0, y: 0, w: 400, h: 400 })).toBe(true);
  });

  it("rejects blobs that would break the layout", () => {
    expect(isWindowRect(null)).toBe(false);
    expect(isWindowRect({ x: 0, y: 0, w: 400 })).toBe(false);
    expect(isWindowRect({ x: "0", y: 0, w: 400, h: 400 })).toBe(false);
    expect(isWindowRect({ x: NaN, y: 0, w: 400, h: 400 })).toBe(false);
  });
});
