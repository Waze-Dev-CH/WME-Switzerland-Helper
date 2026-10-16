import { MAP_MATE_KINDS, type MapMateKind } from "./detect";
import { t, type LocaleCode, type StringKey } from "./i18n";
import {
  buildMapMateQuestion,
  buildMessage,
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

/**
 * An abandoned UR: closed without a word, like a traffic light. Nothing leaves the editor's
 * machine and the closure goes to the undo stack, so no warning. The age is shown because
 * it is the whole reason for closing.
 */
export function closeStaleSpec(
  id: number,
  ageDays: number,
  skip?: SkipOption,
): ConfirmSpec {
  return {
    title: t("dlgTitleOne", { id }),
    facts: [
      t("dlgFactCloseOne"),
      t("dlgFactNoMessage"),
      t("dlgFactAge", { count: ageDays }),
    ],
    confirmLabel: t("dialogCloseOnly"),
    cancelLabel: t("dialogCancel"),
    skip,
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
export function closeSelectedSpec(
  speedCameraLangs: readonly LocaleCode[],
  mapMate: ReadonlyArray<{ kind: MapMateKind; lang: LocaleCode }>,
  staleCount: number,
  editorLang: LocaleCode,
): ConfirmSpec {
  const cameraCount = speedCameraLangs.length;
  const facts: string[] = [];
  if (cameraCount > 0)
    facts.push(t("dlgFactFamilySpeedCamera", { count: cameraCount }));
  if (mapMate.length > 0)
    facts.push(t("dlgFactFamilyMapMate", { count: mapMate.length }));
  if (staleCount > 0)
    facts.push(t("dlgFactFamilyStale", { count: staleCount }));

  // The button names both halves of the change whenever something is sent and closed.
  const sends = cameraCount + mapMate.length > 0;
  const closes = cameraCount + staleCount > 0;
  const confirmKey =
    sends && closes
      ? "dialogConfirm"
      : sends
        ? "dialogSend"
        : "dialogCloseOnly";
  const spec: ConfirmSpec = {
    title: t("dlgTitleSelected", {
      count: cameraCount + mapMate.length + staleCount,
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
        speedCameraLangs,
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
