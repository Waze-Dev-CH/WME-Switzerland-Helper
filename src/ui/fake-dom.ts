/**
 * Minimal `document` double, in the spirit of the fake in `tab-group.test.ts` and the
 * IndexedDB double in `geoadmin/idb-store.test.ts`: the repo runs its tests in Node with
 * no document, and jsdom would be a dependency for the handful of operations the DOM
 * builders actually perform.
 *
 * Test-only. Nothing reachable from `main.user.ts` imports it, so Rollup never bundles it.
 */
export interface FakeNode {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  title: string;
  type: string;
  value: string;
  min: string;
  max: string;
  checked: boolean;
  open: boolean;
  children: FakeNode[];
  attributes: Record<string, string>;
  listeners: Record<string, Array<(event?: unknown) => void>>;
  style: Record<string, string>;
  append(...nodes: Array<FakeNode | string>): void;
  appendChild(node: FakeNode): FakeNode;
  prepend(...nodes: FakeNode[]): void;
  replaceChildren(...nodes: FakeNode[]): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, handler: (event?: unknown) => void): void;
  querySelector(selector: string): FakeNode | null;
  /** Test-only: fire the listeners of a type, with an optional event object. */
  dispatch(type: string, event?: unknown): void;
}

function createNode(tagName: string): FakeNode {
  const node: FakeNode = {
    tagName,
    id: "",
    className: "",
    textContent: "",
    title: "",
    type: "",
    value: "",
    min: "",
    max: "",
    checked: false,
    open: false,
    children: [],
    attributes: {},
    listeners: {},
    style: {},
    append(...nodes) {
      for (const child of nodes) {
        if (typeof child === "string") node.textContent += child;
        else node.children.push(child);
      }
    },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    prepend(...nodes) {
      node.children.unshift(...nodes);
    },
    replaceChildren(...nodes) {
      node.children = [...nodes];
    },
    setAttribute(name, value) {
      node.attributes[name] = value;
    },
    getAttribute(name) {
      return node.attributes[name] ?? null;
    },
    addEventListener(type, handler) {
      (node.listeners[type] ??= []).push(handler);
    },
    querySelector(selector) {
      // Only tag selectors are used by the builders under test.
      for (const child of node.children) {
        if (child.tagName === selector) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    dispatch(type, event) {
      for (const handler of node.listeners[type] ?? []) handler(event);
    },
  };
  return node;
}

interface DocumentListener {
  handler: (event?: unknown) => void;
  capture: boolean;
}

/** The document itself, for the listeners a dialog puts on the whole page. */
export interface FakeDocument {
  createElement(tag: string): FakeNode;
  listeners: Record<string, DocumentListener[]>;
  addEventListener(
    type: string,
    handler: (event?: unknown) => void,
    capture?: boolean,
  ): void;
  removeEventListener(
    type: string,
    handler: (event?: unknown) => void,
    capture?: boolean,
  ): void;
  /** Test-only: fire the listeners of a type, with an optional event object. */
  dispatch(type: string, event?: unknown): void;
}

function createDocument(): FakeDocument {
  const doc: FakeDocument = {
    createElement: (tag) => createNode(tag),
    listeners: {},
    addEventListener(type, handler, capture = false) {
      (doc.listeners[type] ??= []).push({ handler, capture });
    },
    removeEventListener(type, handler, capture = false) {
      doc.listeners[type] = (doc.listeners[type] ?? []).filter(
        (entry) => entry.handler !== handler || entry.capture !== capture,
      );
    },
    dispatch(type, event) {
      for (const entry of [...(doc.listeners[type] ?? [])]) entry.handler(event);
    },
  };
  return doc;
}

/** Installs the double on globalThis and returns the function that removes it. */
export function installFakeDocument(): () => void {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = globals.document;
  globals.document = createDocument();
  return () => {
    globals.document = previous;
  };
}
