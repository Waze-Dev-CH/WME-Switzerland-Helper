import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installFakeDocument,
  type FakeDocument,
  type FakeNode,
} from "./fake-dom";
import {
  showChoice,
  showConfirm,
  showNotice,
  injectDialogStyles,
  type ConfirmSpec,
  type DialogHost,
} from "./dialog";
import { injectStyleOnce } from "./inject";

// The stylesheet needs document.head, which the fake document does not have.
vi.mock("./inject", () => ({ injectStyleOnce: vi.fn() }));

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

function spec(extra: Partial<ConfirmSpec> = {}): ConfirmSpec {
  return {
    title: "Close 1",
    facts: ["One fact"],
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    ...extra,
  };
}

const frenchQuote = {
  label: "Message",
  options: [{ lang: "fr" as const, langLabel: "French", text: "Bonjour" }],
};

function fakeDocument(): FakeDocument {
  return document as unknown as FakeDocument;
}

function pressEscape() {
  const stopPropagation = vi.fn();
  fakeDocument().dispatch("keydown", { key: "Escape", stopPropagation });
  return stopPropagation;
}

let restore: () => void;
beforeEach(() => (restore = installFakeDocument()));
afterEach(() => restore());

describe("showConfirm", () => {
  it("quotes the message and resolves true on the confirm button, then removes itself", async () => {
    const { host, mounted } = makeHost();
    const answer = showConfirm(spec({ quotes: [frenchQuote] }), host);
    const root = mounted[0]!;

    expect(findAll(root, "dlg-quote")[0]?.textContent).toBe("Bonjour");
    findAll(root, "dlg-btn-primary")[0]?.dispatch("click");

    await expect(answer).resolves.toBe(true);
    expect(mounted).toEqual([]);
  });

  it("resolves false on Cancel, the first button", async () => {
    const { host, mounted } = makeHost();
    const answer = showConfirm(spec(), host);

    findAll(mounted[0]!, "dlg-btn")[0]?.dispatch("click");

    await expect(answer).resolves.toBe(false);
  });

  it("switches the quoted text when another language's flag is clicked", () => {
    const { host, mounted } = makeHost();
    void showConfirm(
      spec({
        quotes: [
          {
            label: "Message",
            options: [
              { lang: "fr", langLabel: "French", count: 2, text: "Bonjour" },
              { lang: "de", langLabel: "German", count: 1, text: "Hallo" },
            ],
          },
        ],
      }),
      host,
    );
    const root = mounted[0]!;
    const quote = findAll(root, "dlg-quote")[0]!;
    const [french, german] = findAll(root, "dlg-flag");

    expect(quote.textContent).toBe("Bonjour");
    german?.dispatch("click");

    expect(quote.textContent).toBe("Hallo");
    expect(german?.title).toBe("German");
    expect(german?.getAttribute("aria-pressed")).toBe("true");
    expect(french?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the previous comment as a quotation of its own", () => {
    const { host, mounted } = makeHost();
    void showConfirm(
      spec({ previousComment: { label: "Conversation", text: "still there" } }),
      host,
    );

    expect(findAll(mounted[0]!, "dlg-quote-muted")[0]?.textContent).toBe(
      "still there",
    );
  });

  it("shows one quotation per quoted text", () => {
    const { host, mounted } = makeHost();
    void showConfirm(
      spec({
        quotes: [
          frenchQuote,
          {
            label: "Question",
            options: [
              { lang: "fr", langLabel: "French", text: "Quelle rue ?" },
            ],
          },
        ],
      }),
      host,
    );

    expect(findAll(mounted[0]!, "dlg-quote").map((q) => q.textContent)).toEqual(
      ["Bonjour", "Quelle rue ?"],
    );
  });

  it("resolves true without mounting anything when the skip is remembered", async () => {
    const { host, mounted } = makeHost();
    const remember = vi.fn();
    expect(
      await showConfirm(
        spec({ skip: { label: "Ne plus montrer", isSkipped: true, remember } }),
        host,
      ),
    ).toBe(true);
    expect(mounted).toHaveLength(0);
  });

  it("shows the dialog when the skip is remembered but a conversation is quoted", () => {
    const { host, mounted } = makeHost();
    void showConfirm(
      spec({
        previousComment: { label: "Conversation", text: "still there" },
        skip: { label: "x", isSkipped: true, remember: vi.fn() },
      }),
      host,
    );
    expect(mounted).toHaveLength(1);
  });

  // A confirmation that quotes a conversation is read every time: offering to skip it
  // would offer something the dialog then refuses to honour.
  it("renders no box when a conversation is quoted", () => {
    const { host, mounted } = makeHost();
    void showConfirm(
      spec({
        previousComment: { label: "Conversation", text: "still there" },
        skip: { label: "x", isSkipped: false, remember: vi.fn() },
      }),
      host,
    );
    expect(findAll(mounted[0]!, "dlg-skip")).toEqual([]);
  });

  it("remembers when the box is ticked and the action confirmed", async () => {
    const { host, mounted } = makeHost();
    const remember = vi.fn();
    const answer = showConfirm(
      spec({ skip: { label: "Skip", isSkipped: false, remember } }),
      host,
    );
    const root = mounted[0]!;
    const box = findAll(root, "dlg-skip")[0]!.children[0]!;

    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(false);
    box.checked = true;
    findAll(root, "dlg-btn-primary")[0]?.dispatch("click");

    expect(await answer).toBe(true);
    expect(remember).toHaveBeenCalledOnce();
  });

  it("remembers nothing when the box is ticked and the dialog cancelled", async () => {
    const { host, mounted } = makeHost();
    const remember = vi.fn();
    const answer = showConfirm(
      spec({ skip: { label: "Skip", isSkipped: false, remember } }),
      host,
    );
    const root = mounted[0]!;
    findAll(root, "dlg-skip")[0]!.children[0]!.checked = true;
    findAll(root, "dlg-btn")[0]?.dispatch("click");

    expect(await answer).toBe(false);
    expect(remember).not.toHaveBeenCalled();
  });

  it("renders no box when the spec has no skip", () => {
    const { host, mounted } = makeHost();
    void showConfirm(spec(), host);
    expect(findAll(mounted[0]!, "dlg-skip")).toEqual([]);
  });

  it("uses the danger button when the spec says so", () => {
    const { host, mounted } = makeHost();
    void showConfirm(spec({ danger: true }), host);
    expect(findAll(mounted[0]!, "dlg-btn-danger")).toHaveLength(1);
    expect(findAll(mounted[0]!, "dlg-btn-primary")).toHaveLength(0);
  });

  // WME binds its shortcuts on the document, and the focus is often outside the dialog
  // (a click on the map behind the backdrop, a blur): Escape is caught on the page.
  it("cancels on Escape pressed anywhere on the page, and stops it there", async () => {
    const { host } = makeHost();
    const answer = showConfirm(spec(), host);

    const stopPropagation = pressEscape();

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(await answer).toBe(false);
  });

  it("listens in the capture phase, and only while open", async () => {
    const { host, mounted } = makeHost();
    const answer = showConfirm(spec(), host);

    expect(fakeDocument().listeners.keydown).toEqual([
      expect.objectContaining({ capture: true }),
    ]);
    findAll(mounted[0]!, "dlg-btn-primary")[0]?.dispatch("click");
    await answer;

    expect(fakeDocument().listeners.keydown).toEqual([]);
  });

  it("ignores keys other than Escape", () => {
    const { host, mounted } = makeHost();
    void showConfirm(spec(), host);
    const stopPropagation = vi.fn();

    fakeDocument().dispatch("keydown", { key: "Enter", stopPropagation });

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(mounted).toHaveLength(1);
  });

  it("cancels on a click on the backdrop, not on the dialog", async () => {
    const { host, mounted } = makeHost();
    const answer = showConfirm(spec(), host);
    const backdrop = mounted[0]!;

    backdrop.dispatch("click", { target: backdrop.children[0] });
    expect(mounted).toHaveLength(1);
    backdrop.dispatch("click", { target: backdrop });

    expect(await answer).toBe(false);
  });
});

describe("showChoice", () => {
  it("resolves the clicked value, null on cancel", async () => {
    const choiceSpec = {
      title: "Which",
      facts: [],
      choices: [
        { value: "a" as const, label: "A", description: "first" },
        { value: "b" as const, label: "B" },
      ],
      cancelLabel: "Cancel",
    };
    const first = makeHost();
    const picked = showChoice(choiceSpec, first.host);
    findAll(first.mounted[0]!, "dlg-choice")[1]?.dispatch("click");
    expect(await picked).toBe("b");

    const second = makeHost();
    const cancelled = showChoice(choiceSpec, second.host);
    findAll(second.mounted[0]!, "dlg-btn")[0]?.dispatch("click");
    expect(await cancelled).toBeNull();
  });

  it("resolves null on Escape pressed anywhere on the page", async () => {
    const { host } = makeHost();
    const answer = showChoice(
      {
        title: "Which",
        facts: [],
        choices: [{ value: "a" as const, label: "A" }],
        cancelLabel: "Cancel",
      },
      host,
    );

    const stopPropagation = pressEscape();

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(await answer).toBeNull();
    expect(fakeDocument().listeners.keydown).toEqual([]);
  });
});

describe("showNotice", () => {
  it("renders its title and resolves on OK", async () => {
    const { host, mounted } = makeHost();
    const done = showNotice(
      { title: "Done", text: "3 closed", okLabel: "OK" },
      host,
    );

    expect(findAll(mounted[0]!, "dlg-dialog-title")[0]?.textContent).toBe(
      "Done",
    );
    findAll(mounted[0]!, "dlg-btn-primary")[0]?.dispatch("click");

    await expect(done).resolves.toBeUndefined();
  });
});

describe("injectDialogStyles", () => {
  it("emits the dark-skin rules", () => {
    injectDialogStyles();
    const css = vi.mocked(injectStyleOnce).mock.calls[0]![1];
    expect(css).toContain("html.wmech-theme-dark .dlg-pane");
  });
});
