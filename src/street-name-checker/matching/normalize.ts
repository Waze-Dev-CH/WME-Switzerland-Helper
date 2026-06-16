/**
 * Name normalization, three levels:
 *  - K0: raw (trim + NFC). K0 equality = perfect match.
 *  - K1: cosmetic (typography, case, whitespace). K1 hit with K0 diff = trivially fixable.
 *    Accents are KEPT at K1: "Foret" vs "Forêt" is a real error, not cosmetic.
 *  - K2: expanded (accent folding, hyphen<->space, abbreviation expansion).
 *    K2 hit with K1 diff = real difference with an obvious official suggestion.
 */

export function k0(name: string): string {
  return name.normalize("NFC").trim();
}

const APOSTROPHES = /[’ʼ´`]/g; // ’ ʼ ´ `
const DASHES = /[–—−]/g; // – — −

export function k1(name: string): string {
  let s = k0(name);
  s = s.replace(APOSTROPHES, "'");
  s = s.replace(DASHES, "-");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*-\s*/g, "-");
  s = s.toLowerCase();
  s = s.replace(/ß/g, "ss");
  return s.trim();
}

export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

export interface AbbreviationRule {
  /** Lowercase token form, without trailing period. */
  abbrev: string;
  /** Possible full forms; several entries when ambiguous across languages. */
  expansions: string[];
  /** Only expand when the abbreviation is the first token of the name. */
  firstTokenOnly?: boolean;
}

/**
 * Community-extensible abbreviation table. Word-boundary anchored (whole tokens).
 * Deliberately NOT expanded: bare "r." (rue? route? too ambiguous).
 */
export const ABBREVIATIONS: AbbreviationRule[] = [
  { abbrev: "av", expansions: ["avenue"], firstTokenOnly: true },
  { abbrev: "bd", expansions: ["boulevard"] },
  { abbrev: "bvd", expansions: ["boulevard"] },
  { abbrev: "boul", expansions: ["boulevard"] },
  { abbrev: "ch", expansions: ["chemin"], firstTokenOnly: true },
  { abbrev: "rte", expansions: ["route"] },
  { abbrev: "pl", expansions: ["place", "platz", "piazza"] },
  { abbrev: "imp", expansions: ["impasse"] },
  { abbrev: "prom", expansions: ["promenade"] },
  { abbrev: "pass", expansions: ["passage"] },
  { abbrev: "fbg", expansions: ["faubourg"] },
  { abbrev: "fg", expansions: ["faubourg"] },
  { abbrev: "st", expansions: ["saint", "sankt"] },
  { abbrev: "ste", expansions: ["sainte"] },
  { abbrev: "str", expansions: ["strasse"] },
  // multi-word expansions are supported (joined into the key as-is)
  { abbrev: "zi", expansions: ["zone industrielle"] },
  { abbrev: "za", expansions: ["zone artisanale"] },
  { abbrev: "gd", expansions: ["grand"] },
  { abbrev: "gde", expansions: ["grande"] },
  { abbrev: "all", expansions: ["allee"], firstTokenOnly: true },
  { abbrev: "esp", expansions: ["esplanade"], firstTokenOnly: true },
  { abbrev: "anc", expansions: ["ancien", "ancienne"] },
  { abbrev: "gen", expansions: ["general"] },
  { abbrev: "dr", expansions: ["docteur"] },
  { abbrev: "pt", expansions: ["petit"] },
  { abbrev: "pte", expansions: ["petite"] },
];

const ABBREV_MAP = new Map(ABBREVIATIONS.map((r) => [r.abbrev, r]));

/** Cap on variant combinations (e.g. several multi-expansion tokens in one name). */
const MAX_VARIANTS = 8;

/**
 * French/Italian function words whose presence often differs between Waze and
 * the register ("Chemin de Montaz" vs "Chemin de la Montaz"). German articles
 * are deliberately NOT stripped: they are integral to names like "Im Grund".
 */
const ARTICLES = new Set([
  "de", "du", "des", "la", "le", "les",
  "di", "da", "del", "della", "delle", "dei", "degli", "al", "alla", "ai",
]);

/**
 * Way-type words (odonym types) for stem matching: a Waze "Chemin de la Guérite"
 * whose official name is "Route de la Guérite" shares the stem "guerite".
 * Applied to K2 keys (lowercase, accents folded, abbreviations expanded).
 */
const WAY_TYPE_WORDS = new Set([
  // fr
  "rue", "route", "chemin", "avenue", "boulevard", "impasse", "sentier", "passage",
  "place", "promenade", "quai", "ruelle", "allee", "faubourg", "esplanade", "montee",
  "clos", "square",
  // it
  "via", "viale", "vicolo", "piazza", "piazzetta", "strada", "sentiero", "corso",
  "salita", "riva",
]);

/** German way-type suffixes glued to single-token names (Bahnhofstrasse / Bahnhofweg). */
const GERMAN_SUFFIXES = /^(.{4,}?)(strasse|weg|gasse|platz)$/;

/** Multi-word way types ("Zone Industrielle La Palaz A" -> stem "palaz a"). */
const MULTI_WAY_TYPE_PREFIXES: string[][] = [
  ["zone", "industrielle"],
  ["zone", "artisanale"],
  ["zone", "commerciale"],
  ["zona", "industriale"],
  ["zona", "artigianale"],
];

/**
 * Stem of a K2 key: the name without its way-type word and without articles.
 * "chemin de la guerite" -> "guerite"; "bahnhofweg" -> "bahnhof".
 * Returns null when there is no recognizable way type or the stem is too short.
 */
export function stemKey(key: string): string | null {
  const tokens = key.split(" ");
  let rest: string[] | null = null;
  const first = tokens[0];
  for (const prefix of MULTI_WAY_TYPE_PREFIXES) {
    if (tokens.length > prefix.length && prefix.every((word, i) => tokens[i] === word)) {
      rest = tokens.slice(prefix.length);
      break;
    }
  }
  if (!rest && tokens.length >= 2 && first !== undefined && WAY_TYPE_WORDS.has(first)) {
    rest = tokens.slice(1);
  } else if (tokens.length === 1 && first !== undefined) {
    const m = first.match(GERMAN_SUFFIXES);
    if (m && m[1] !== undefined) rest = [m[1]];
  }
  if (!rest || rest.length === 0) return null;
  const cleaned = rest.filter((t) => !ARTICLES.has(t)).map((t) => t.replace(/^[ld]'/, ""));
  const stem = (cleaned.length > 0 ? cleaned : rest).join(" ");
  return stem.length >= 3 ? stem : null;
}

/** One route designation: A9, A 1, E62, N5, H18, T10 (optional letter suffix). */
const ROUTE_DESIGNATION = /^[AENHT] ?\d{1,3}[a-z]?$/i;

/**
 * Highway-style names ("A9", "E62", "A9 - E62", "A1/E25") are Waze conventions
 * for numbered routes; they never appear in the GeoNV street register, which
 * only names streets inside localities.
 */
export function isRouteDesignation(name: string): boolean {
  const parts = name.split(/\s*[-/|]\s*/).filter((p) => p.length > 0);
  return parts.length > 0 && parts.every((part) => ROUTE_DESIGNATION.test(part.trim()));
}

/**
 * Article stripping without the two-token guard, for stem comparisons of names
 * that carry no way-type word ("La Bricoleta" -> "bricoleta").
 */
export function bareStem(key: string): string | null {
  const stem = key
    .split(" ")
    .filter((token) => !ARTICLES.has(token))
    .map((token) => token.replace(/^[ld]'/, ""))
    .join(" ");
  return stem.length >= 3 ? stem : null;
}

/** Article-stripped form of a K2 key; null when stripping would leave < 2 tokens. */
export function stripArticles(key: string): string | null {
  const tokens = key
    .split(" ")
    .filter((token) => !ARTICLES.has(token))
    .map((token) => token.replace(/^[ld]'/, ""));
  if (tokens.length < 2) return null;
  const stripped = tokens.join(" ");
  return stripped === key ? null : stripped;
}

/**
 * Expanded keys. Returns every plausible canonical form (multi-language
 * abbreviations like "pl." or "st." produce several variants).
 */
export function k2(name: string): string[] {
  let s = k1(name);
  s = foldAccents(s);
  // German glued suffix: "bahnhofstr." / "bahnhofstr" -> "bahnhofstrasse".
  // Lookahead keeps "bahnhofstrasse" itself untouched.
  s = s.replace(/(\p{L}{2,})str\.?(?=$|\s|-)/gu, "$1strasse");
  // collapse spaced initialisms so "Z. I." reaches the table as "zi"
  s = s.replace(/\b(\p{L})\. ?(\p{L})\.(?=\s|$)/gu, "$1$2");
  s = s.replace(/-/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  const tokens = s.split(" ").filter((t) => t.length > 0);
  let variants: string[][] = [[]];
  tokens.forEach((token, i) => {
    const bare = token.replace(/\./g, "");
    const rule = ABBREV_MAP.get(bare);
    const options = rule && (!rule.firstTokenOnly || i === 0) ? rule.expansions : [bare];
    variants = variants
      .flatMap((v) => options.map((option) => [...v, option]))
      .slice(0, MAX_VARIANTS);
  });
  const keys = [...new Set(variants.map((v) => v.join(" ")))];
  // Article-insensitive variants come LAST so stricter keys win in the cascade.
  for (const key of [...keys]) {
    const stripped = stripArticles(key);
    if (stripped && !keys.includes(stripped)) keys.push(stripped);
  }
  return keys;
}
