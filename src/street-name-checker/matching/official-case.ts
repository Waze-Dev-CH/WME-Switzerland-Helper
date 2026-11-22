import type { OfficialStreet } from "../geoadmin/types";
import { k0 } from "./normalize";

/**
 * Geneva's register writes family names in capitals: "Rue SCHAUB", "Avenue Giuseppe-MOTTA",
 * "Rue MICHELI-DU-CREST". The federal register passes that spelling on as delivered. It is a
 * cadastral convention, not the name: in Waze it shouts on the map, and a checker that called
 * "Rue Schaub" a typo of "Rue SCHAUB" invited any editor, first-day ones included, to rewrite
 * a whole city that way.
 *
 * Measured on the national register (November 2026): 799 Geneva labels carry a word in
 * capitals; every other canton together has about a hundred, and those are all acronyms
 * (SBB, CFF, STEP, RUAG, FIFA, Roman numerals). Title-casing everywhere would damage them, so
 * the convention is scoped to Geneva, and the guard that matters everywhere is `raisesCase`.
 */

/** BFS commune numbers 6601-6645 are Geneva's, and the 66xx block belongs to no other canton. */
const GENEVA_FOSNR_MIN = 6600;
const GENEVA_FOSNR_MAX = 6699;

/** The only acronyms in Geneva's register; every other word in capitals there is a name. */
const ACRONYMS = new Set(["ONU", "CBS"]);

const ROMAN_NUMERAL = /^(X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * Words whose case the register cannot tell: "Micheli-du-Crest" but "François-Le-Fort". They
 * are left to the Waze name rather than guessed. "d" and "l" are the elided forms ("D'YVOY").
 */
const PARTICLES = new Set(["de", "du", "des", "la", "le", "les", "d", "l"]);

const APOSTROPHE = /^['’]$/;

export function writesNamesInCapitals(street: OfficialStreet): boolean {
  return street.comFosnr >= GENEVA_FOSNR_MIN && street.comFosnr <= GENEVA_FOSNR_MAX;
}

/** Words at odd indices, separators (possibly empty) at even ones. */
function pieces(name: string): string[] {
  return k0(name).split(/([\p{L}\p{M}]+)/u);
}

function isCapitals(word: string): boolean {
  return word === word.toUpperCase() && word !== word.toLowerCase();
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function isShouted(word: string): boolean {
  return (
    word.length >= 2 && isCapitals(word) && !ACRONYMS.has(word) && !ROMAN_NUMERAL.test(word)
  );
}

type WordKind = "plain" | "name" | "particle";

/** Kind of the word at odd index `i` of a register spelling split by `pieces`. */
function kindAt(parts: string[], i: number): WordKind {
  const word = parts[i] ?? "";
  if (isShouted(word)) return PARTICLES.has(word.toLowerCase()) ? "particle" : "name";
  // "D'YVOY": the single letter carries no case information of its own.
  const elided =
    word.length === 1 &&
    isCapitals(word) &&
    APOSTROPHE.test(parts[i + 1] ?? "") &&
    isShouted(parts[i + 2] ?? "");
  return elided ? "particle" : "plain";
}

/** Whether a Waze word is an acceptable writing of a shouted register word. */
function acceptable(kind: WordKind, wazeWord: string, registerWord: string): boolean {
  if (wazeWord === titleCase(registerWord)) return true;
  return kind === "particle" && wazeWord === registerWord.toLowerCase();
}

/**
 * Whether a Waze name is the register's name once its capitals are read as a convention:
 * a shouted name must be in title case, a particle may be in lowercase or title case, and
 * every other character must match exactly. Typography stays a real difference.
 */
export function sameUpToOfficialCase(wazeName: string, registerName: string): boolean {
  const waze = pieces(wazeName);
  const register = pieces(registerName);
  if (waze.length !== register.length) return false;
  return register.every((registerPiece, i) => {
    const wazePiece = waze[i] ?? "";
    const kind = i % 2 === 1 ? kindAt(register, i) : "plain";
    if (kind === "plain") return wazePiece === registerPiece;
    return acceptable(kind, wazePiece, registerPiece);
  });
}

/**
 * The register's name in the case Waze should carry. A shouted name is title-cased. A
 * particle takes the case the Waze name already gives the same word; without one it stays
 * in capitals and the result is not `certain`, so nobody applies it in one click.
 */
export function resolveOfficialCase(
  registerName: string,
  wazeName: string | null,
): { name: string; certain: boolean } {
  const wazeWords = new Map<string, string>();
  pieces(wazeName ?? "").forEach((piece, i) => {
    const lower = piece.toLowerCase();
    if (i % 2 === 1 && !wazeWords.has(lower)) wazeWords.set(lower, piece);
  });

  let certain = true;
  const parts = pieces(registerName);
  const resolved = parts.map((piece, i) => {
    const kind = i % 2 === 1 ? kindAt(parts, i) : "plain";
    if (kind === "plain") return piece;
    if (kind === "name") return titleCase(piece);
    const wazeWord = wazeWords.get(piece.toLowerCase());
    if (wazeWord !== undefined && acceptable(kind, wazeWord, piece)) return wazeWord;
    certain = false;
    return piece;
  });
  return { name: resolved.join(""), certain };
}

/**
 * Whether applying `suggestion` would turn a word of the current name into capitals. The
 * script never does that, in any canton: an acronym the register is right about is still
 * one manual edit away, while a convention copied by mistake reaches a whole city.
 */
export function raisesCase(currentName: string | null, suggestion: string): boolean {
  const current = pieces(currentName ?? "").filter((_, i) => i % 2 === 1);
  return pieces(suggestion).some((word, i) => {
    if (i % 2 === 0 || word.length < 2 || !isCapitals(word)) return false;
    const lower = word.toLowerCase();
    const same = current.filter((w) => w.toLowerCase() === lower);
    return same.length > 0 && !same.some(isCapitals);
  });
}
