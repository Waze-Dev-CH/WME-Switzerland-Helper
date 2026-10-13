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
 * An abandoned UR: closed without a word, like a traffic light. Nothing leaves the editor's
 * machine and the closure goes to the undo stack, so no warning. The age is shown because
 * it is the whole reason for closing.
 */
export function closeStaleSpec(id: number, ageDays: number): ConfirmSpec {
  return {
    title: t("dlgTitleOne", { id }),
    facts: [
      t("dlgFactCloseOne"),
      t("dlgFactNoMessage"),
      t("dlgFactAge", { count: ageDays }),
    ],
    confirmLabel: t("dialogCloseOnly"),
    cancelLabel: t("dialogCancel"),
  };
}

/**
 * The single batch: one line per family, so the editor reads what happens to each, not
 * just a total. The quote and the warning only appear when speed cameras are in it, since
 * they alone send something that cannot be withdrawn.
 *
 * Every language of the batch is offered, not only the editor's: the German or Italian
 * text is what those reporters will read, and the editor should be able to see it before
 * sending it to them.
 */
export function closeSelectedSpec(
  speedCameraLangs: readonly LocaleCode[],
  staleCount: number,
  editorLang: LocaleCode,
): ConfirmSpec {
  const cameraCount = speedCameraLangs.length;
  const facts: string[] = [];
  if (cameraCount > 0)
    facts.push(t("dlgFactFamilySpeedCamera", { count: cameraCount }));
  if (staleCount > 0)
    facts.push(t("dlgFactFamilyStale", { count: staleCount }));

  const spec: ConfirmSpec = {
    title: t("dlgTitleSelected", { count: cameraCount + staleCount }),
    facts,
    confirmLabel: t(cameraCount > 0 ? "dialogConfirm" : "dialogCloseOnly"),
    cancelLabel: t("dialogCancel"),
  };
  if (cameraCount === 0) return spec;

  const counts = languageCounts(speedCameraLangs);
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
  spec.quotes = {
    label: t("dlgQuoteLabel"),
    hint: options.length > 1 ? t("dlgQuoteHint") : undefined,
    options,
  };
  spec.warning = t("dlgWarningAll");
  return spec;
}
