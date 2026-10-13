import type { ConversationElement } from "wme-sdk-typings";
import { hasDiscussion, type MapMateKind } from "./detect";
import { t, tIn, type LocaleCode, type StringKey } from "./i18n";

/**
 * The reporter's language, from `userPreferences.language`.
 *
 * That field is the Waze app's own language id, NOT an ISO code: "francais", "eng" and
 * "portuguese_pt" were observed in WME. The German and Italian ids were not, so this
 * matches on the prefix ("deutsch", "italiano" being the likely values) rather than on a
 * closed table that would silently send English to every German speaker.
 */
export function messageLanguage(raw: string | null | undefined): LocaleCode {
  const value = (raw ?? "").toLowerCase();
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("de")) return "de";
  if (value.startsWith("it")) return "it";
  return "en";
}

/**
 * The text sent to the reporter: one sentence tying the answer to the speed camera they
 * reported, then the official wording verbatim. The official text speaks of police reports
 * only, and on its own a reporter would not connect it to their speed camera.
 *
 * One idea per paragraph: the app shows the comment on a phone, where a single block of
 * four sentences reads as a wall of text.
 *
 * The signature has its own key rather than closing `messageBody`: `isOfficialMessage`
 * matches the body verbatim, and comments sent before the signature existed must still match.
 */
export function buildMessage(lang: LocaleCode): string {
  const intro = tIn(lang, "messageIntro");
  const body = tIn(lang, "messageBody");
  const signature = tIn(lang, "messageSignature");
  return `${intro}\n\n${body}\n\n${signature}`;
}

/** Spacing is not ours to trust once the server has stored and returned a comment. */
function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Whether a comment contains our official wording, in any of the four languages.
 *
 * `messaged` in close.ts lives in memory only. When an editor closes URs and then does not
 * save (discard, reload, failed save), the UR is open again next session with our comment
 * already in its conversation; the text is the only trace left of it. The body is matched
 * rather than the intro: it is the verbatim official part, and the intro may be reworded.
 */
export function isOfficialMessage(text: string): boolean {
  const comment = collapseSpaces(text);
  return ORDER.some((lang) =>
    comment.includes(collapseSpaces(tIn(lang, "messageBody"))),
  );
}

const ORDER: readonly LocaleCode[] = ["fr", "de", "it", "en"];

/** How many URs of a batch get each language, most frequent first, absent ones left out. */
export function languageCounts(
  langs: readonly LocaleCode[],
): Array<{ lang: LocaleCode; count: number }> {
  return ORDER.map((lang) => ({
    lang,
    count: langs.filter((l) => l === lang).length,
  }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

const ASK_BODY: Record<MapMateKind, StringKey> = {
  trafficLight: "askBodyTrafficLight",
  route: "askBodyRoute",
  speedLimit: "askBodySpeedLimit",
  turn: "askBodyTurn",
  general: "askBodyGeneral",
};

const KIND_LABEL: Record<MapMateKind, StringKey> = {
  trafficLight: "kindTrafficLight",
  route: "kindRoute",
  speedLimit: "kindSpeedLimit",
  turn: "kindTurn",
  general: "kindGeneral",
};

/** Same layout as buildMessage: greeting, the case's question, the community's signature. */
export function buildMapMateQuestion(
  kind: MapMateKind,
  lang: LocaleCode,
): string {
  const intro = tIn(lang, "askIntro");
  const body = tIn(lang, ASK_BODY[kind]);
  const signature = tIn(lang, "messageSignature");
  return `${intro}\n\n${body}\n\n${signature}`;
}

/**
 * Whether a comment holds one of our questions, any case, any language. The body is
 * matched, as in isOfficialMessage. It matters because hasDiscussion does not see a comment
 * that comes back without a name, and ours might.
 */
export function isMapMateQuestion(text: string): boolean {
  const comment = collapseSpaces(text);
  const bodies = Object.values(ASK_BODY);
  return ORDER.some((lang) =>
    bodies.some((key) => comment.includes(collapseSpaces(tIn(lang, key)))),
  );
}

/** Nobody but Map_Team wrote, and our question is not there yet. */
export function mayAskMapMate(
  comments: readonly ConversationElement[],
): boolean {
  const asked = comments.some((comment) => isMapMateQuestion(comment.text));
  return !hasDiscussion(comments) && !asked;
}

export function kindLabel(kind: MapMateKind): string {
  return t(KIND_LABEL[kind]);
}
