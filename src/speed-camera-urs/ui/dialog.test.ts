import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeDocument, type FakeNode } from "../../ui/fake-dom";
import { closeAllSpec, closeOneSpec } from "../confirm-spec";
import { buildMessage } from "../message";
import { showConfirm, showNotice, type DialogHost } from "./dialog";

// The stylesheet needs document.head, which the fake document does not have.
vi.mock("./styles", () => ({ injectStyles: () => {} }));

function findAll(node: FakeNode, className: string): FakeNode[] {
  const own = node.className.split(" ").includes(className) ? [node] : [];
  return [
    ...own,
    ...node.children.flatMap((child) => findAll(child, className)),
  ];
}

function makeHost() {
  const mounted: FakeNode[] = [];
  const host = {
    mount: (node: unknown) => mounted.push(node as FakeNode),
    unmount: (node: unknown) =>
      mounted.splice(mounted.indexOf(node as FakeNode), 1),
  } as unknown as DialogHost;
  return { host, mounted };
}

let restore: () => void;
beforeEach(() => (restore = installFakeDocument()));
afterEach(() => restore());

describe("showConfirm", () => {
  it("quotes the message and resolves true on the confirm button, then removes itself", async () => {
    const { host, mounted } = makeHost();
    const answer = showConfirm(closeOneSpec(1, "fr", null), host);
    const root = mounted[0]!;

    expect(findAll(root, "scu-quote")[0]?.textContent).toBe(buildMessage("fr"));
    findAll(root, "scu-btn-primary")[0]?.dispatch("click");

    await expect(answer).resolves.toBe(true);
    expect(mounted).toEqual([]);
  });

  it("resolves false on Cancel, the first button", async () => {
    const { host, mounted } = makeHost();
    const answer = showConfirm(closeOneSpec(1, "fr", null), host);

    findAll(mounted[0]!, "scu-btn")[0]?.dispatch("click");

    await expect(answer).resolves.toBe(false);
  });

  it("switches the quoted text when another language's flag is clicked", () => {
    const { host, mounted } = makeHost();
    void showConfirm(closeAllSpec(["fr", "fr", "de"], "fr"), host);
    const root = mounted[0]!;
    const quote = findAll(root, "scu-quote")[0]!;
    const [french, german] = findAll(root, "scu-flag");

    expect(quote.textContent).toBe(buildMessage("fr"));
    german?.dispatch("click");

    expect(quote.textContent).toBe(buildMessage("de"));
    expect(german?.getAttribute("aria-pressed")).toBe("true");
    expect(french?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the previous comment as a quotation of its own", () => {
    const { host, mounted } = makeHost();
    void showConfirm(closeOneSpec(1, "fr", "still there"), host);

    expect(findAll(mounted[0]!, "scu-quote-muted")[0]?.textContent).toBe(
      "still there",
    );
  });
});

describe("showNotice", () => {
  it("resolves on OK", async () => {
    const { host, mounted } = makeHost();
    const done = showNotice("3 closed", host);

    findAll(mounted[0]!, "scu-btn-primary")[0]?.dispatch("click");

    await expect(done).resolves.toBeUndefined();
  });
});
