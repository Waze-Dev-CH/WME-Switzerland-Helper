import { describe, expect, it } from "vitest";
import { groupScriptTab, tabLabelText, TAB_PREFIX } from "./tab-group";

/**
 * Minimal DOM double. The repo runs its tests in Node with no document, and pulling in
 * jsdom for one module would be a dependency for a handful of operations: parentElement,
 * get/setAttribute, querySelector(All) on an attribute, and after(). Same reasoning as the
 * hand-rolled IndexedDB double in the tile store's test.
 */
interface FakeElement {
  name: string;
  attributes: Record<string, string>;
  parentElement: FakeParent | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  after(node: FakeElement): void;
}

interface FakeParent {
  children: FakeElement[];
  querySelectorAll(selector: string): FakeElement[];
  querySelector(selector: string): FakeElement | null;
}

/** Supports `[attr]` and `[attr="value"]`, which is all the module uses. */
function matches(element: FakeElement, selector: string): boolean {
  const withValue = selector.match(/^\[([\w-]+)="([^"]*)"\]$/);
  if (withValue) return element.attributes[withValue[1] as string] === withValue[2];
  const bare = selector.match(/^\[([\w-]+)\]$/);
  return bare ? element.attributes[bare[1] as string] !== undefined : false;
}

function makeParent(names: string[]): { parent: FakeParent; byName: Map<string, FakeElement> } {
  const parent: FakeParent = {
    children: [],
    querySelectorAll: (selector) => parent.children.filter((child) => matches(child, selector)),
    querySelector: (selector) => parent.children.find((child) => matches(child, selector)) ?? null,
  };
  const byName = new Map<string, FakeElement>();

  for (const name of names) {
    const element: FakeElement = {
      name,
      attributes: {},
      parentElement: parent,
      setAttribute: (attribute, value) => {
        element.attributes[attribute] = value;
      },
      getAttribute: (attribute) => element.attributes[attribute] ?? null,
      after: (node) => {
        const from = parent.children.indexOf(node);
        if (from !== -1) parent.children.splice(from, 1);
        parent.children.splice(parent.children.indexOf(element) + 1, 0, node);
      },
    };
    parent.children.push(element);
    byName.set(name, element);
  }
  return { parent, byName };
}

const order = (parent: FakeParent) => parent.children.map((child) => child.name);
const group = (label: FakeElement, pane: FakeElement, id: string) =>
  groupScriptTab(label as unknown as HTMLElement, pane as unknown as HTMLElement, id);

describe("tabLabelText", () => {
  it("prefixes the title with the invariant marker", () => {
    expect(tabLabelText("Couches")).toBe(`${TAB_PREFIX} · Couches`);
  });

  it("uses a prefix that does not change with the language", () => {
    // Each feature owns its i18next instance: a translated prefix would render
    // "Suisse · …" next to "Schweiz · …" and stop marking anything.
    expect(TAB_PREFIX).toBe("CH");
  });
});

describe("groupScriptTab", () => {
  it("leaves the first tab where WME put it", () => {
    const labels = makeParent(["other-a", "ours-1", "other-b"]);
    const panes = makeParent(["p-other-a", "p-ours-1", "p-other-b"]);

    group(labels.byName.get("ours-1")!, panes.byName.get("p-ours-1")!, "one");

    expect(order(labels.parent)).toEqual(["other-a", "ours-1", "other-b"]);
  });

  it("pulls the next tabs next to the first, in registration order", () => {
    const labels = makeParent(["ours-1", "other-a", "ours-2", "other-b", "ours-3"]);
    const panes = makeParent(["p-ours-1", "p-other-a", "p-ours-2", "p-other-b", "p-ours-3"]);

    group(labels.byName.get("ours-1")!, panes.byName.get("p-ours-1")!, "one");
    group(labels.byName.get("ours-2")!, panes.byName.get("p-ours-2")!, "two");
    group(labels.byName.get("ours-3")!, panes.byName.get("p-ours-3")!, "three");

    expect(order(labels.parent)).toEqual(["ours-1", "ours-2", "ours-3", "other-a", "other-b"]);
  });

  it("moves each pane the same way as its label", () => {
    // If WME pairs a tab with its panel by position, moving only the labels would open the
    // wrong panel. The two lists must stay in step.
    const labels = makeParent(["ours-1", "other-a", "ours-2"]);
    const panes = makeParent(["p-ours-1", "p-other-a", "p-ours-2"]);

    group(labels.byName.get("ours-1")!, panes.byName.get("p-ours-1")!, "one");
    group(labels.byName.get("ours-2")!, panes.byName.get("p-ours-2")!, "two");

    expect(order(labels.parent)).toEqual(["ours-1", "ours-2", "other-a"]);
    expect(order(panes.parent)).toEqual(["p-ours-1", "p-ours-2", "p-other-a"]);
  });

  it("marks both elements so a later tab can find them", () => {
    const labels = makeParent(["ours-1"]);
    const panes = makeParent(["p-ours-1"]);

    group(labels.byName.get("ours-1")!, panes.byName.get("p-ours-1")!, "one");

    expect(labels.byName.get("ours-1")!.getAttribute("data-wmech-tab")).toBe("one");
    expect(panes.byName.get("p-ours-1")!.getAttribute("data-wmech-tab")).toBe("one");
  });

  it("does nothing rather than throw when the element is detached", () => {
    const orphan = { attributes: {}, parentElement: null } as unknown as HTMLElement;
    expect(() => groupScriptTab(orphan, orphan, "one")).not.toThrow();
  });

  it("does nothing rather than throw when the bar has an unexpected shape", () => {
    // WME can change the Scripts bar overnight; a failed grouping must never cost a tab.
    const broken = {
      parentElement: {
        querySelectorAll: () => {
          throw new Error("structure changed");
        },
      },
    } as unknown as HTMLElement;
    expect(() => groupScriptTab(broken, broken, "one")).not.toThrow();
  });
});
