import { tIn, type LocaleCode } from "./i18n";

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
 */
export function buildMessage(lang: LocaleCode): string {
  return `${tIn(lang, "messageIntro")}\n\n${tIn(lang, "messageBody")}`;
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

/** "3 FR, 2 DE, 1 IT": what a batch is about to send, for its confirmation. */
export function describeLanguages(langs: readonly LocaleCode[]): string {
  return ORDER.map((lang) => ({
    lang,
    count: langs.filter((l) => l === lang).length,
  }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((entry) => `${entry.count} ${entry.lang.toUpperCase()}`)
    .join(", ");
}
