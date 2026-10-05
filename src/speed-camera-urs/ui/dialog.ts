import { button, el, icon } from "../../ui/dom";
import type { ConfirmSpec, QuoteOption } from "../confirm-spec";
import { t, type LocaleCode, type StringKey } from "../i18n";
import { FLAG_SRC } from "./flags";
import { injectStyles } from "./styles";

/**
 * The confirmation and notice dialogs of this feature.
 *
 * Its own rather than the host's `showWmeDialog`, which centres every line of a plain
 * string: fine for "OK?", unreadable for four paragraphs that are about to reach a real
 * person. Same containment as that helper: a modal appended to the page, nothing else
 * touched, and it removes itself once answered.
 */

/** Where the dialog lives. Injectable so the tests can run without a page. */
export interface DialogHost {
  mount(node: HTMLElement): void;
  unmount(node: HTMLElement): void;
}

const pageHost: DialogHost = {
  mount: (node) => document.body.appendChild(node),
  unmount: (node) => node.remove(),
};

const LANGUAGE_NAME: Record<LocaleCode, StringKey> = {
  fr: "langFr",
  de: "langDe",
  it: "langIt",
  en: "langEn",
};

function flag(lang: LocaleCode): HTMLImageElement {
  const img = el("img", "scu-flag-img");
  img.src = FLAG_SRC[lang];
  img.alt = lang.toUpperCase();
  return img;
}

/**
 * One chip per language. With several, they switch the quoted text; with one, the chip
 * only says which language the reporter will read.
 */
function quoteSection(
  quotes: NonNullable<ConfirmSpec["quotes"]>,
): HTMLElement[] {
  const first = quotes.options[0];
  if (!first) return [];
  const quote = el("blockquote", "scu-quote", first.text);
  const chips = el("div", "scu-flags");
  const interactive = quotes.options.length > 1;
  const chipNodes: HTMLElement[] = [];

  const select = (option: QuoteOption, chip: HTMLElement) => {
    quote.textContent = option.text;
    for (const node of chipNodes)
      node.setAttribute("aria-pressed", String(node === chip));
  };

  for (const option of quotes.options) {
    const chip = interactive
      ? button("", () => select(option, chip), "scu-flag")
      : el("span", "scu-flag");
    chip.title = t(LANGUAGE_NAME[option.lang]);
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

  const head = el("div", "scu-dialog-head");
  head.append(el("span", "", quotes.label), chips);
  const nodes = [head, quote];
  if (quotes.hint) nodes.push(el("div", "scu-note", quotes.hint));
  return nodes;
}

/** Wraps content in the backdrop and resolves once, whichever way the dialog is closed. */
function open<T>(
  content: HTMLElement[],
  actions: (finish: (value: T) => void) => HTMLButtonElement[],
  dismissValue: T,
  host: DialogHost,
): Promise<T> {
  injectStyles();
  return new Promise((resolve) => {
    const backdrop = el("div", "scu-backdrop");
    const dialog = el("div", "scu-pane scu-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      host.unmount(backdrop);
      resolve(value);
    };

    const buttons = actions(finish);
    const row = el("div", "scu-dialog-actions");
    row.append(...buttons);
    dialog.append(...content, row);
    backdrop.appendChild(dialog);

    backdrop.addEventListener("click", (event) => {
      if (event?.target === backdrop) finish(dismissValue);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event?.key === "Escape") finish(dismissValue);
    });

    host.mount(backdrop);
    // The first button gets the focus: for a confirmation that is Cancel, so a stray Enter
    // never sends anything.
    buttons[0]?.focus?.();
  });
}

export function showConfirm(
  spec: ConfirmSpec,
  host: DialogHost = pageHost,
): Promise<boolean> {
  const content: HTMLElement[] = [el("h2", "scu-dialog-title", spec.title)];

  const facts = el("ul", "scu-dialog-facts");
  for (const fact of spec.facts) facts.appendChild(el("li", "", fact));
  content.push(facts);

  if (spec.previousComment) {
    content.push(
      el("div", "scu-dialog-head", spec.previousComment.label),
      el("blockquote", "scu-quote scu-quote-muted", spec.previousComment.text),
    );
  }
  if (spec.quotes) content.push(...quoteSection(spec.quotes));
  if (spec.warning) {
    const warning = el("div", "scu-warn scu-dialog-warning");
    warning.append(icon("warning"), el("span", "", spec.warning));
    content.push(warning);
  }

  return open(
    content,
    (finish) => [
      button(spec.cancelLabel, () => finish(false), "scu-btn"),
      button(spec.confirmLabel, () => finish(true), "scu-btn scu-btn-primary"),
    ],
    false,
    host,
  );
}

export function showNotice(
  text: string,
  host: DialogHost = pageHost,
): Promise<void> {
  return open<void>(
    [el("div", "scu-dialog-text", text)],
    (finish) => [
      button(t("dialogOk"), () => finish(), "scu-btn scu-btn-primary"),
    ],
    undefined,
    host,
  );
}
