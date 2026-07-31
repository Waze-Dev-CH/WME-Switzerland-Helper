import { damerauLevenshtein } from "../street-name-checker/matching/distance";
import { k1, k2 } from "../street-name-checker/matching/normalize";

/**
 * How forgiving the street comparison is.
 *
 * `strict` is the default and should stay it: a wrong match here does not mistype a name,
 * it creates a house number on the wrong street. Swiss WME segments are named from the same
 * official register the GWR points at, so exact and expanded forms cover nearly everything.
 */
export type MatchStrictness = "strict" | "loose";

const LOOSE_MAX_DISTANCE = 2;

/**
 * Does an address point belong to the selected segment's street?
 *
 * Both sides are lists: the register carries every language of a bilingual commune
 * (["Rue Centrale", "Zentralstrasse"] on all 200 entries measured in Biel/Bienne) and a
 * segment carries its primary name plus its alternates. Comparing only the first of each,
 * as the reference userscript does, greys out half of every bilingual town.
 */
export function matchesSegmentStreet(
  gwrNames: string[],
  segmentNames: string[],
  strictness: MatchStrictness = "strict",
): boolean {
  if (gwrNames.length === 0 || segmentNames.length === 0) return false;

  const segmentK1 = new Set(segmentNames.map(k1));
  if (gwrNames.some((name) => segmentK1.has(k1(name)))) return true;

  // K2 expands the Swiss abbreviations ("Rte" -> "Route", "Bahnhofstr." -> "Bahnhofstrasse")
  // and folds accents, producing several plausible forms per name.
  const segmentK2 = new Set(segmentNames.flatMap(k2));
  const gwrK2 = gwrNames.flatMap(k2);
  if (gwrK2.some((key) => segmentK2.has(key))) return true;

  if (strictness === "strict") return false;

  const segmentKeys = [...segmentK2];
  return gwrK2.some((key) =>
    segmentKeys.some(
      (candidate) => damerauLevenshtein(key, candidate, LOOSE_MAX_DISTANCE) <= LOOSE_MAX_DISTANCE,
    ),
  );
}
