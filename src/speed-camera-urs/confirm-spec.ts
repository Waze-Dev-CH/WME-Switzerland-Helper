import { MAP_MATE_KINDS, type MapMateKind } from "./detect";
import { t, type LocaleCode, type StringKey } from "./i18n";
import {
  buildMapMateQuestion,
  buildMessage,
  buildStaleClosing,
  buildStaleReminder,
  kindLabel,
  languageCounts,
} from "./message";
import type { ConfirmSpec, QuoteBlock, SkipOption } from "../ui/dialog";

const LANGUAGE_NAME: Record<LocaleCode, StringKey> = {
  fr: "langFr",
  de: "langDe",
  it: "langIt",
  en: "langEn",
};

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
    quotes: [
      {
        label: t("dlgQuoteLabel"),
        options: [
          { lang, langLabel: t(LANGUAGE_NAME[lang]), text: buildMessage(lang) },
        ],
      },
    ],
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

/**
 * The reporter already has the message: nothing is quoted because nothing is sent. Their
 * reply, when they answered it, is shown instead, and the dialog then always appears.
 */
export function closeOnlySpec(
  id: number,
  skip?: SkipOption,
  previousComment: string | null = null,
): ConfirmSpec {
  const spec: ConfirmSpec = {
    title: t("dlgTitleOne", { id }),
    facts: [t("confirmCloseOnly")],
    confirmLabel: t("dialogCloseOnly"),
    cancelLabel: t("dialogCancel"),
    skip,
  };
  if (previousComment !== null) {
    spec.previousComment = {
      label: t("dlgConversation"),
      text: excerpt(previousComment),
    };
  }
  return spec;
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

/** One text, in the reporter's language, under the given label. */
function singleQuote(
  label: string,
  lang: LocaleCode,
  text: string,
): QuoteBlock {
  return {
    label,
    options: [{ lang, langLabel: t(LANGUAGE_NAME[lang]), text }],
  };
}

/**
 * The last reminder to an abandoned UR: the exact text, and that the UR stays open. The
 * idle days are shown because they are the whole reason for writing.
 */
export function remindStaleSpec(
  id: number,
  lang: LocaleCode,
  idleDays: number,
): ConfirmSpec {
  return {
    title: t("dlgTitleRemind", { id }),
    facts: [
      t("dlgFactSendOne"),
      t("dlgFactStaysOpen"),
      t("dlgFactAge", { count: idleDays }),
    ],
    quotes: [singleQuote(t("dlgQuoteLabel"), lang, buildStaleReminder(lang))],
    warning: t("dlgWarningOne"),
    confirmLabel: t("dialogSend"),
    cancelLabel: t("dialogCancel"),
  };
}

/**
 * Closing an abandoned UR after its reminder: the closing message is quoted and leaves
 * now. When it already left (a Ctrl+Z reopened the UR), nothing is sent, nothing is
 * quoted, and that is the only case that may carry "don't show again".
 */
export function closeStaleSpec(
  id: number,
  lang: LocaleCode,
  remindedDays: number,
  closingSent: boolean,
  skip?: SkipOption,
): ConfirmSpec {
  if (closingSent)
    return {
      title: t("dlgTitleOne", { id }),
      facts: [t("dlgFactCloseOne"), t("dlgFactClosingSent")],
      confirmLabel: t("dialogCloseOnly"),
      cancelLabel: t("dialogCancel"),
      skip,
    };
  return {
    title: t("dlgTitleOne", { id }),
    facts: [
      t("dlgFactSendOne"),
      t("dlgFactCloseOne"),
      t("dlgFactReminded", { count: remindedDays }),
    ],
    quotes: [singleQuote(t("dlgQuoteLabel"), lang, buildStaleClosing(lang))],
    warning: t("dlgWarningOne"),
    confirmLabel: t("dialogConfirm"),
    cancelLabel: t("dialogCancel"),
  };
}

/**
 * Every language of the batch is offered, not only the editor's: the German or Italian
 * text is what those reporters will read. The editor's own language comes first when the
 * batch has it, since it is the one they can proofread.
 */
function languageQuote(
  label: string,
  langs: readonly LocaleCode[],
  editorLang: LocaleCode,
  textIn: (lang: LocaleCode) => string,
): QuoteBlock {
  const counts = languageCounts(langs);
  const ordered = [
    ...counts.filter((entry) => entry.lang === editorLang),
    ...counts.filter((entry) => entry.lang !== editorLang),
  ];
  const options = ordered.map((entry) => ({
    lang: entry.lang,
    langLabel: t(LANGUAGE_NAME[entry.lang]),
    count: entry.count,
    text: textIn(entry.lang),
  }));
  const hint = options.length > 1 ? t("dlgQuoteHint") : undefined;
  return { label, hint, options };
}

/**
 * The single batch: one line per family, so the editor reads what happens to each, then
 * every text that will leave, one quotation each. No quote and no warning when nothing is
 * sent.
 */
export interface SelectedLangs {
  speedCamera: readonly LocaleCode[];
  mapMate: ReadonlyArray<{ kind: MapMateKind; lang: LocaleCode }>;
  /** Abandoned URs closed with the closing message. */
  stale: readonly LocaleCode[];
  /** Abandoned URs reminded, left open. */
  staleRemind: readonly LocaleCode[];
}

export function closeSelectedSpec(
  selected: SelectedLangs,
  editorLang: LocaleCode,
): ConfirmSpec {
  const { mapMate } = selected;
  const cameraCount = selected.speedCamera.length;
  const staleCount = selected.stale.length;
  const remindCount = selected.staleRemind.length;
  const facts: string[] = [];
  if (cameraCount > 0)
    facts.push(t("dlgFactFamilySpeedCamera", { count: cameraCount }));
  if (mapMate.length > 0)
    facts.push(t("dlgFactFamilyMapMate", { count: mapMate.length }));
  if (staleCount > 0)
    facts.push(t("dlgFactFamilyStale", { count: staleCount }));
  if (remindCount > 0)
    facts.push(t("dlgFactFamilyStaleRemind", { count: remindCount }));

  // The button names both halves of the change whenever something is sent and closed.
  // Every family sends something now; only the speed cameras and closures also close.
  const sends = cameraCount + mapMate.length + staleCount + remindCount > 0;
  const closes = cameraCount + staleCount > 0;
  const confirmKey =
    sends && closes
      ? "dialogConfirm"
      : sends
        ? "dialogSend"
        : "dialogCloseOnly";
  const spec: ConfirmSpec = {
    title: t("dlgTitleSelected", {
      count: cameraCount + mapMate.length + staleCount + remindCount,
    }),
    facts,
    confirmLabel: t(confirmKey),
    cancelLabel: t("dialogCancel"),
  };

  const quotes: QuoteBlock[] = [];
  if (cameraCount > 0)
    quotes.push(
      languageQuote(
        t("dlgQuoteLabel"),
        selected.speedCamera,
        editorLang,
        buildMessage,
      ),
    );
  for (const kind of MAP_MATE_KINDS) {
    const langs = mapMate.filter((m) => m.kind === kind).map((m) => m.lang);
    if (langs.length === 0) continue;
    const label = t("dlgQuoteLabelKind", { kind: kindLabel(kind) });
    quotes.push(
      languageQuote(label, langs, editorLang, (lang) =>
        buildMapMateQuestion(kind, lang),
      ),
    );
  }
  if (staleCount > 0)
    quotes.push(
      languageQuote(
        t("dlgQuoteLabelClosing"),
        selected.stale,
        editorLang,
        buildStaleClosing,
      ),
    );
  if (remindCount > 0)
    quotes.push(
      languageQuote(
        t("dlgQuoteLabelReminder"),
        selected.staleRemind,
        editorLang,
        buildStaleReminder,
      ),
    );
  if (quotes.length === 0) return spec;
  spec.quotes = quotes;
  spec.warning = t("dlgWarningAll");
  return spec;
}

/** One Map Mate report: the exact question, and that the UR stays open. */
export function askMapMateSpec(
  id: number,
  kind: MapMateKind,
  lang: LocaleCode,
): ConfirmSpec {
  return {
    title: t("dlgTitleAsk", { id, kind: kindLabel(kind) }),
    facts: [t("dlgFactSendOne"), t("dlgFactStaysOpen")],
    quotes: [
      {
        label: t("dlgQuoteLabel"),
        options: [
          {
            lang,
            langLabel: t(LANGUAGE_NAME[lang]),
            text: buildMapMateQuestion(kind, lang),
          },
        ],
      },
    ],
    warning: t("dlgWarningOne"),
    confirmLabel: t("dialogSend"),
    cancelLabel: t("dialogCancel"),
  };
}
