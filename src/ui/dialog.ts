import { componentRules } from "./components";
import { button, el, icon } from "./dom";
import { FLAG_SRC, type FlagLang } from "./flags";
import { injectStyleOnce } from "./inject";
import { tokenRules } from "./tokens";

/**
 * The confirmation, choice and notice dialogs shared by every feature.
 *
 * Its own rather than a plain-string helper, which would centre every line of a
 * string: fine for "OK?", unreadable for four paragraphs that are about to reach a real
 * person. Same containment as that helper: a modal appended to the page, nothing else
 * touched, and it removes itself once answered.
 *
 * Labels always come from the caller: each feature has its own i18next instance and
 * language preference, so this module never translates anything itself.
 */

/** Where the dialog lives. Injectable so the tests can run without a page. */
export interface DialogHost {
  mount(node: HTMLElement): void;
  unmount(node: HTMLElement): void;
}

/** One language the quoted text leaves in, and the exact text sent in it. */
export interface QuoteOption {
  lang: FlagLang;
  /** The language's name, for the chip tooltip. */
  langLabel: string;
  /** How many items of a batch get this language; absent for a single one. */
  count?: number;
  text: string;
}

/** One quoted text, one option per language it leaves in. */
export interface QuoteBlock {
  label: string;
  hint?: string;
  options: QuoteOption[];
}

/** A "don't ask again" box. The caller owns the storage. */
export interface SkipOption {
  label: string;
  isSkipped: boolean;
  remember(): void;
}

/**
 * What a confirmation says, kept free of DOM so the flows can be tested on it.
 */
export interface ConfirmSpec {
  title: string;
  facts: string[];
  /** A muted line under the facts. */
  note?: string;
  /** The last comment, when the UR already has a conversation. */
  previousComment?: { label: string; text: string };
  /** Each text that will leave, in order; within one, the first language is shown first. */
  quotes?: QuoteBlock[];
  warning?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Red confirm button, for a deletion. */
  danger?: boolean;
  skip?: SkipOption;
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface ChoiceSpec<T extends string> {
  title: string;
  facts: string[];
  choices: Choice<T>[];
  cancelLabel: string;
}

export interface NoticeSpec {
  title: string;
  text: string;
  okLabel: string;
  /** Only for routine news; a failure must be read every time. */
  skip?: SkipOption;
}

const CSS = `
${tokenRules("dlg", [".dlg-pane"])}
${componentRules("dlg")}

/* The dialog carries .dlg-pane too, so the tokens and the dark skin apply to it as well. */
.dlg-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .4); }
.dlg-dialog { width: min(92vw, 520px); max-height: 86vh; overflow: auto; padding: 18px 20px; gap: 12px; background: var(--dlg-bg); border: 1px solid var(--dlg-border); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, .35); text-align: left; line-height: 1.45; }
.dlg-dialog-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--dlg-text); }
.dlg-dialog-facts { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.dlg-dialog-note { color: var(--dlg-muted); font-size: 11px; }
.dlg-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; margin-bottom: -6px; }
.dlg-dialog-text { white-space: pre-line; }
/* The message exactly as the reporter will read it: a quotation, left-aligned, breaks kept. */
.dlg-quote { margin: 0; padding: 10px 12px; border-left: 3px solid var(--dlg-primary); border-radius: 0 6px 6px 0; background: var(--dlg-info-bg); color: var(--dlg-text); white-space: pre-line; }
.dlg-quote-muted { border-left-color: var(--dlg-border); background: var(--dlg-surface); color: var(--dlg-muted); font-style: italic; }
.dlg-flags { display: flex; gap: 4px; flex-wrap: wrap; }
.dlg-flag { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border: 1px solid var(--dlg-border); border-radius: 12px; background: var(--dlg-surface); color: var(--dlg-text); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
button.dlg-flag { cursor: pointer; height: auto; min-height: 0; text-transform: none; letter-spacing: normal; box-shadow: none; }
.dlg-flag[aria-pressed="false"] { opacity: .65; }
.dlg-flag[aria-pressed="true"] { border-color: var(--dlg-primary); background: var(--dlg-info-bg); opacity: 1; }
.dlg-flag-img { width: 18px; height: 12px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .15); }
.dlg-dialog-warning { display: flex; align-items: flex-start; gap: 6px; white-space: pre-line; }
.dlg-dialog-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.dlg-btn-danger { border: none; background: var(--dlg-error); color: #fff; font-weight: 600; padding: 5px 12px; }
.dlg-btn-danger:hover { border: none; filter: brightness(1.08); color: #fff; }
.dlg-skip { display: inline-flex; align-items: center; gap: 5px; margin-right: auto; font-size: 11px; color: var(--dlg-muted); cursor: pointer; }
.dlg-choices { display: flex; flex-direction: column; gap: 6px; }
.dlg-choice { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 8px 12px; height: auto; text-align: left; border: 1px solid var(--dlg-border); border-radius: 6px; background: var(--dlg-surface); color: var(--dlg-text); font-size: 12px; font-weight: 700; text-transform: none; letter-spacing: normal; cursor: pointer; }
.dlg-choice-description { font-size: 11px; font-weight: 400; color: var(--dlg-muted); }
.dlg-choice:hover { border-color: var(--dlg-primary); }
`;

/** Injects the dialog stylesheet once. Exported so a test can read what is emitted. */
export function injectDialogStyles(): void {
  injectStyleOnce("dialog", CSS);
}

const pageHost: DialogHost = {
  mount: (node) => document.body.appendChild(node),
  unmount: (node) => node.remove(),
};

function flag(lang: FlagLang): HTMLImageElement {
  const img = el("img", "dlg-flag-img");
  img.src = FLAG_SRC[lang];
  img.alt = lang.toUpperCase();
  return img;
}

/**
 * One chip per language. With several, they switch the quoted text; with one, the chip
 * only says which language the reporter will read.
 */
function quoteSection(quotes: QuoteBlock): HTMLElement[] {
  const first = quotes.options[0];
  if (!first) return [];
  const quote = el("blockquote", "dlg-quote", first.text);
  const chips = el("div", "dlg-flags");
  const interactive = quotes.options.length > 1;
  const chipNodes: HTMLElement[] = [];

  const select = (option: QuoteOption, chip: HTMLElement) => {
    quote.textContent = option.text;
    for (const node of chipNodes)
      node.setAttribute("aria-pressed", String(node === chip));
  };

  for (const option of quotes.options) {
    const chip = interactive
      ? button("", () => select(option, chip), "dlg-flag")
      : el("span", "dlg-flag");
    chip.title = option.langLabel;
    chip.appendChild(flag(option.lang));
    const label =
      option.count === undefined
        ? option.lang.toUpperCase()
        : String(option.count);
    chip.appendChild(el("span", "", label));
    if (interactive)
      chip.setAttribute("aria-pressed", String(option === first));
    chipNodes.push(chip);
    chips.appendChild(chip);
  }

  const head = el("div", "dlg-dialog-head");
  head.append(el("span", "", quotes.label), chips);
  const nodes = [head, quote];
  if (quotes.hint) nodes.push(el("div", "dlg-note", quotes.hint));
  return nodes;
}

/** Makes title ids unique, since two dialogs can be in the page at once. */
let openings = 0;

/**
 * Puts the title above the content, wraps it all in the backdrop and resolves once,
 * whichever way the dialog is closed.
 */
function open<T>(
  title: string,
  content: HTMLElement[],
  actions: (finish: (value: T) => void) => HTMLButtonElement[],
  dismissValue: T,
  host: DialogHost,
  extras: HTMLElement[] = [],
): Promise<T> {
  injectDialogStyles();
  return new Promise((resolve) => {
    const backdrop = el("div", "dlg-backdrop");
    const dialog = el("div", "dlg-pane dlg-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    // Screen readers announce the dialog by its title.
    const heading = el("h2", "dlg-dialog-title", title);
    heading.id = `dlg-title-${++openings}`;
    dialog.setAttribute("aria-labelledby", heading.id);

    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown, true);
      host.unmount(backdrop);
      resolve(value);
    };

    // On the document, capture phase: WME binds its own shortcuts there, and the focus is
    // not always inside the dialog. Stopped here, Escape only closes the dialog.
    function onKeydown(event: KeyboardEvent) {
      if (event?.key !== "Escape") return;
      event.stopPropagation();
      finish(dismissValue);
    }

    const buttons = actions(finish);
    const row = el("div", "dlg-dialog-actions");
    row.append(...extras, ...buttons);
    dialog.append(heading, ...content, row);
    backdrop.appendChild(dialog);

    backdrop.addEventListener("click", (event) => {
      if (event?.target === backdrop) finish(dismissValue);
    });
    document.addEventListener("keydown", onKeydown, true);

    host.mount(backdrop);
    // The first button gets the focus: for a confirmation that is Cancel, so a stray Enter
    // never sends anything.
    buttons[0]?.focus?.();
  });
}

/** Unticked on every opening: the choice is made knowingly, each time it is made. */
function skipBox(skip: SkipOption, extras: HTMLElement[]): HTMLInputElement {
  const label = el("label", "dlg-skip");
  const box = el("input");
  box.type = "checkbox";
  label.append(box, el("span", "", skip.label));
  extras.push(label);
  return box;
}

function factList(facts: string[]): HTMLElement {
  const list = el("ul", "dlg-dialog-facts");
  for (const fact of facts) list.appendChild(el("li", "", fact));
  return list;
}

export function showConfirm(
  spec: ConfirmSpec,
  host: DialogHost = pageHost,
): Promise<boolean> {
  // A remembered answer never hides a conversation: the editor must still see what the
  // reporter wrote before anything is sent.
  if (spec.skip?.isSkipped && !spec.previousComment)
    return Promise.resolve(true);

  const content: HTMLElement[] = [factList(spec.facts)];
  if (spec.note) content.push(el("div", "dlg-dialog-note", spec.note));

  if (spec.previousComment) {
    content.push(
      el("div", "dlg-dialog-head", spec.previousComment.label),
      el("blockquote", "dlg-quote dlg-quote-muted", spec.previousComment.text),
    );
  }
  for (const block of spec.quotes ?? []) content.push(...quoteSection(block));
  if (spec.warning) {
    const warning = el("div", "dlg-warn dlg-dialog-warning");
    warning.append(icon("warning"), el("span", "", spec.warning));
    content.push(warning);
  }

  // Never offered beside a conversation, which is shown every time whatever was remembered.
  const extras: HTMLElement[] = [];
  let box: HTMLInputElement | undefined;
  if (spec.skip && !spec.previousComment) {
    box = skipBox(spec.skip, extras);
  }
  const confirmClass = spec.danger
    ? "dlg-btn dlg-btn-danger"
    : "dlg-btn dlg-btn-primary";

  return open(
    spec.title,
    content,
    (finish) => [
      button(spec.cancelLabel, () => finish(false), "dlg-btn"),
      button(
        spec.confirmLabel,
        () => {
          if (box?.checked) spec.skip?.remember();
          finish(true);
        },
        confirmClass,
      ),
    ],
    false,
    host,
    extras,
  );
}

export function showChoice<T extends string>(
  spec: ChoiceSpec<T>,
  host: DialogHost = pageHost,
): Promise<T | null> {
  const choices = el("div", "dlg-choices");
  const content = [factList(spec.facts), choices];
  return open<T | null>(
    spec.title,
    content,
    (finish) => {
      for (const choice of spec.choices) {
        const node = button("", () => finish(choice.value), "dlg-choice");
        node.appendChild(el("span", "", choice.label));
        if (choice.description)
          node.appendChild(
            el("span", "dlg-choice-description", choice.description),
          );
        choices.appendChild(node);
      }
      return [button(spec.cancelLabel, () => finish(null), "dlg-btn")];
    },
    null,
    host,
  );
}

export function showNotice(
  spec: NoticeSpec,
  host: DialogHost = pageHost,
): Promise<void> {
  if (spec.skip?.isSkipped) return Promise.resolve();

  const extras: HTMLElement[] = [];
  const box = spec.skip ? skipBox(spec.skip, extras) : undefined;
  return open<void>(
    spec.title,
    [el("div", "dlg-dialog-text", spec.text)],
    (finish) => [
      button(
        spec.okLabel,
        () => {
          if (box?.checked) spec.skip?.remember();
          finish();
        },
        "dlg-btn dlg-btn-primary",
      ),
    ],
    undefined,
    host,
    extras,
  );
}
