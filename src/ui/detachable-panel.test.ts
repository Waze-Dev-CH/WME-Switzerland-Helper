import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetachablePanel } from "./detachable-panel";
import { installFakeDocument, type FakeNode } from "./fake-dom";
import { CASCADE_STEP_PX, type WindowRect } from "./window-geometry";
import type { WindowMode, WindowStateStore } from "./window-mode";

/** The panel is typed against the real DOM; the double stands in at runtime. */
const asFake = (node: unknown): FakeNode => node as FakeNode;
const asReal = (node: FakeNode): HTMLElement => node as unknown as HTMLElement;

let restoreDocument: () => void;
let body: FakeNode;
/** Docked after each test: open windows are module state, and would shift the next ones. */
let panels: DetachablePanel[] = [];

beforeEach(() => {
  restoreDocument = installFakeDocument();
  const doc = document as unknown as Record<string, unknown>;
  body = asFake(document.createElement("body"));
  doc.body = body;
  doc.head = document.createElement("head");
  vi.stubGlobal("window", {
    innerWidth: 1600,
    innerHeight: 900,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  for (const panel of panels) if (panel.isDetached()) panel.toggle();
  panels = [];
  vi.unstubAllGlobals();
  restoreDocument();
});

function memoryStore(mode: WindowMode = "sidebar"): WindowStateStore & {
  rect: WindowRect | undefined;
} {
  const state = { mode, rect: undefined as WindowRect | undefined };
  return {
    getMode: () => state.mode,
    setMode: (next) => void (state.mode = next),
    getRect: () => state.rect,
    setRect: (rect) => void (state.rect = rect),
    get rect() {
      return state.rect;
    },
  };
}

const labels = () => ({
  title: "UR assistant",
  dock: "Dock",
  dockTitle: "Put it back",
  detachedNote: "This panel is open in a floating window.",
});

function setup(mode: WindowMode = "sidebar") {
  const sidebar = asFake(document.createElement("div"));
  const store = memoryStore(mode);
  const moves: boolean[] = [];
  const panel = new DetachablePanel({
    panelId: "ur-assistant",
    sidebar: asReal(sidebar),
    prefix: "scu",
    icon: "warning",
    labels,
    onModeChange: (detached) => moves.push(detached),
    store,
  });
  panels.push(panel);
  const content = asFake(document.createElement("div"));
  content.className = "scu-pane";
  panel.show(asReal(content));
  return { panel, sidebar, store, content, moves };
}

/** The window's content area, where the panel lands once detached. */
const windowBody = (): FakeNode | undefined =>
  body.children[0]?.children.find(
    (c) => c.className === "wmech-window-content",
  );

const text = (node: FakeNode): string =>
  node.textContent + node.children.map(text).join("");

describe("DetachablePanel", () => {
  it("lives in the sidebar until asked to leave", () => {
    const { sidebar, content } = setup();

    expect(sidebar.children).toEqual([content]);
    expect(body.children).toEqual([]);
  });

  it("moves the very same element into a window, and leaves a way back in the tab", () => {
    const { panel, sidebar, content, store, moves } = setup();

    panel.detach();

    expect(windowBody()?.children).toEqual([content]);
    expect(body.children[0]?.id).toBe("wmech-window-ur-assistant");
    expect(text(sidebar)).toContain("This panel is open in a floating window.");
    expect(store.getMode()).toBe("floating");
    expect(moves).toEqual([true]);
    expect(panel.isDetached()).toBe(true);
  });

  it("comes back from the button left in the tab", () => {
    const { panel, sidebar, content, store, moves } = setup();
    panel.detach();
    const back = sidebar.children[0]?.children.find(
      (c) => c.tagName === "button",
    );

    back?.dispatch("click");

    expect(sidebar.children).toEqual([content]);
    expect(body.children).toEqual([]);
    expect(store.getMode()).toBe("sidebar");
    expect(moves).toEqual([true, false]);
  });

  it("puts a rebuilt panel where the old one was", () => {
    const { panel, sidebar } = setup();
    panel.detach();
    const rebuilt = asFake(document.createElement("div"));

    panel.show(asReal(rebuilt));

    expect(windowBody()?.children).toEqual([rebuilt]);
    expect(text(sidebar)).toContain("floating window");
  });

  it("reopens the window it was left in at the last session", () => {
    const { panel, content } = setup("floating");

    panel.restore();

    expect(windowBody()?.children).toEqual([content]);
  });

  it("toggles both ways, as the keyboard shortcut does", () => {
    const { panel, sidebar, content } = setup();

    panel.toggle();
    expect(panel.isDetached()).toBe(true);
    panel.toggle();
    expect(panel.isDetached()).toBe(false);
    expect(sidebar.children).toEqual([content]);
  });

  it("opens a second window one step aside, and on top of the first", () => {
    const first = setup();
    const second = setup();

    first.panel.detach();
    second.panel.detach();

    const [a, b] = body.children;
    expect(Number.parseInt(b?.style.top ?? "", 10)).toBe(
      Number.parseInt(a?.style.top ?? "", 10) + CASCADE_STEP_PX,
    );
    expect(Number(b?.style.zIndex)).toBeGreaterThan(Number(a?.style.zIndex));
    expect(Number(b?.style.zIndex)).toBeLessThan(10000);
  });
});
