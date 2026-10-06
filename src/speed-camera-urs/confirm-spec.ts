import { t, type LocaleCode } from "./i18n";
import { buildMessage, languageCounts } from "./message";

/** One language the message leaves in, and the exact text sent in it. */
export interface QuoteOption {
  lang: LocaleCode;
  /** How many URs of the batch get this language; absent for a single UR. */
  count?: number;
  text: string;
}

/**
 * What a confirmation says, kept free of DOM so the flows can be tested on it. The dialog
 * renders it; a test reads it.
 */
export interface ConfirmSpec {
  title: string;
  facts: string[];
  /** The last comment, when the UR already has a conversation. */
  previousComment?: { label: string; text: string };
  /** The message as it will leave, one option per language; the first one is shown first. */
  quotes?: { label: string; hint?: string; options: QuoteOption[] };
  warning?: string;
  confirmLabel: string;
  cancelLabel: string;
}

const EXCERPT_MAX = 200;

/** Long comments would push the message itself below the fold of the dialog. */
export function excerpt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= EXCERPT_MAX) return trimmed;
  return `${trimmed.slice(0, EXCERPT_MAX)}…`;
}

export function closeOneSpec(
  id: number,
  lang: LocaleCode,
  lastComment: string | null,
): ConfirmSpec {
  const spec: ConfirmSpec = {
    title: t("dlgTitleOne", { id }),
    facts: [t("dlgFactSendOne"), t("dlgFactCloseOne")],
    quotes: {
      label: t("dlgQuoteLabel"),
      options: [{ lang, text: buildMessage(lang) }],
    },
    warning: t("dlgWarningOne"),
    confirmLabel: t("dialogConfirm"),
    cancelLabel: t("dialogCancel"),
  };
  if (lastComment !== null) {
    spec.previousComment = {
      label: t("dlgConversation"),
      text: excerpt(lastComment),
    };
  }
  return spec;
}

/** The reporter already has the message: nothing is quoted because nothing is sent. */
export function closeOnlySpec(id: number): ConfirmSpec {
  return {
    title: t("dlgTitleOne", { id }),
    facts: [t("confirmCloseOnly")],
    confirmLabel: t("dialogCloseOnly"),
    cancelLabel: t("dialogCancel"),
  };
}

/**
 * A traffic light reported on a freeway: closed without a word to the reporter, since the
 * official text speaks of a speed camera they never mentioned. Nothing leaves the editor's
 * machine, the closure alone goes to the undo stack, so no warning either.
 */
export function closeTrafficLightSpec(
  id: number,
  lastComment: string | null,
): ConfirmSpec {
  const spec: ConfirmSpec = {
    title: t("dlgTitleOne", { id }),
    facts: [t("dlgFactCloseOne"), t("dlgFactNoMessage")],
    confirmLabel: t("dialogCloseOnly"),
    cancelLabel: t("dialogCancel"),
  };
  if (lastComment !== null) {
    spec.previousComment = {
      label: t("dlgConversation"),
      text: excerpt(lastComment),
    };
  }
  return spec;
}

/**
 * Every language of the batch is offered, not only the editor's: the German or Italian
 * text is what those reporters will read, and the editor should be able to see it before
 * sending it to them.
 */
export function closeAllSpec(
  langs: readonly LocaleCode[],
  editorLang: LocaleCode,
): ConfirmSpec {
  const counts = languageCounts(langs);
  // The editor's own language first when the batch has it: it is the one they can proofread.
  const ordered = [
    ...counts.filter((entry) => entry.lang === editorLang),
    ...counts.filter((entry) => entry.lang !== editorLang),
  ];
  const options = ordered.map((entry) => ({
    lang: entry.lang,
    count: entry.count,
    text: buildMessage(entry.lang),
  }));
  return {
    title: t("dlgTitleAll", { count: langs.length }),
    facts: [
      t("dlgFactSendAll", { count: langs.length }),
      t("dlgFactCloseAll", { count: langs.length }),
    ],
    quotes: {
      label: t("dlgQuoteLabel"),
      hint: options.length > 1 ? t("dlgQuoteHint") : undefined,
      options,
    },
    warning: t("dlgWarningAll"),
    confirmLabel: t("dialogConfirm"),
    cancelLabel: t("dialogCancel"),
  };
}
