import type { OfficialStreet } from "../geoadmin/types";
import { damerauLevenshtein } from "./distance";
import { bareStem, foldAccents, k0, k1, k2, stemKey } from "./normalize";

/**
 * Stem used to MATCH a name against the stem index. Names without a way-type
 * word fall back to their article-stripped form: Waze "Vers-Chez-Cherbuin"
 * must reach the official "Rue Vers-chez-Cherbuin" (stem "vers chez cherbuin").
 */
function queryStem(primaryK2Key: string): string | null {
  return stemKey(primaryK2Key) ?? bareStem(primaryK2Key);
}

/**
 * One-to-one comparison of a Waze name against a single candidate (typically
 * the official street under the segment): same cascade as the index lookup
 * but without ambiguity concerns, since the candidate is spatially determined.
 */
export function compareNameToCandidate(
  query: string,
  candidate: string,
): "exact" | "cosmetic" | "variant" | "near" | "stem" | null {
  if (k0(query) === k0(candidate)) return "exact";
  if (k1(query) === k1(candidate)) return "cosmetic";
  const queryKeys = k2(query);
  const candidateKeys = k2(candidate);
  if (queryKeys.some((key) => candidateKeys.includes(key))) return "variant";
  const q = queryKeys[0];
  const c = candidateKeys[0];
  if (q && c) {
    const maxDist = q.length < 8 ? 1 : 2;
    if (damerauLevenshtein(q, c, maxDist) <= maxDist) return "near";
    // stem comparison: at least one side must carry a real way-type word,
    // the other may be a bare name ("Vers-Chez-Cherbuin" vs "Rue Vers-chez-Cherbuin")
    if (stemKey(q) || stemKey(c)) {
      const qs = queryStem(q);
      const cs = queryStem(c);
      if (qs && cs && qs === cs) return "stem";
    }
  }
  return null;
}

/** One indexed name: a full official label, or one side of a bilingual "A/B" label. */
export interface IndexedEntry {
  street: OfficialStreet;
  /** The name to compare against and to apply on fix. */
  namePart: string;
  /** True when namePart is one side of a slash-separated bilingual label. */
  isSlashPart: boolean;
  /** K1-normalized locality from zip_label ("1003 Lausanne" -> "lausanne"). */
  locality: string;
}

export type MatchLevel = "exact" | "cosmetic" | "variant" | "near" | "stem";

export interface MatchResult {
  level: MatchLevel;
  /** Best candidate after ranking. */
  entry: IndexedEntry;
  candidates: IndexedEntry[];
  /** Damerau-Levenshtein distance, only for level "near". */
  distance?: number;
  /** False when a locality was given and no candidate belongs to it. */
  inLocality: boolean;
}

export function localityFromZipLabel(zipLabel: string): string {
  return k1(zipLabel.replace(/^\d{4}\s*/, ""));
}

function isExistingStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "bestehend" || s === "real" || s === "existing";
}

function rankScore(entry: IndexedEntry, locality?: string): number {
  let score = 0;
  if (entry.street.official) score += 8;
  if (isExistingStatus(entry.street.status)) score += 4;
  const t = entry.street.type.toLowerCase();
  if (t !== "benanntes gebiet" && t !== "area") score += 2;
  if (locality && entry.locality === locality) score += 1;
  return score;
}

function pushTo(map: Map<string, IndexedEntry[]>, key: string, entry: IndexedEntry): void {
  const list = map.get(key);
  if (list) list.push(entry);
  else map.set(key, [entry]);
}

interface FuzzyCandidate {
  entry: IndexedEntry;
  key: string;
}

const FUZZY_LENGTH_SLACK = 2;

/**
 * Other-language parts of a bilingual "A / B" official label, excluding the part
 * chosen as the primary suggestion. Empty for monolingual labels. Used to offer the
 * remaining language(s) as Waze alternate names on fix (e.g. primary
 * "Rue de l'Hôpital", alternate "Spitalstrasse").
 */
export function otherLanguageLabels(label: string, primary: string): string[] {
  if (!label.includes("/")) return [];
  return label
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => k1(p) !== k1(primary));
}

/** Lookup structure over the official streets of one scanned area. */
export class OfficialIndex {
  private byK0 = new Map<string, IndexedEntry[]>();
  private byK1 = new Map<string, IndexedEntry[]>();
  private byK2 = new Map<string, IndexedEntry[]>();
  /** Buckets by first character of the folded K2 key, for bounded fuzzy search. */
  private fuzzyBuckets = new Map<string, FuzzyCandidate[]>();
  /** Stem (name minus way-type word and articles) -> entries, for WRONG_TYPE detection. */
  private byStem = new Map<string, IndexedEntry[]>();
  private all: IndexedEntry[] = [];
  readonly entryCount: number;
  readonly streetCount: number;

  constructor(streets: OfficialStreet[]) {
    let entries = 0;
    for (const street of streets) {
      const locality = localityFromZipLabel(street.zipLabel);
      const parts = street.label.includes("/")
        ? [street.label, ...street.label.split("/").map((p) => p.trim()).filter(Boolean)]
        : [street.label];
      parts.forEach((namePart, i) => {
        const entry: IndexedEntry = {
          street,
          namePart,
          isSlashPart: i > 0,
          locality,
        };
        entries++;
        this.all.push(entry);
        pushTo(this.byK0, k0(namePart), entry);
        pushTo(this.byK1, k1(namePart), entry);
        const k2Keys = k2(namePart);
        for (const key of k2Keys) pushTo(this.byK2, key, entry);
        const primary = k2Keys[0];
        if (primary && primary.length > 0) {
          const bucketKey = primary[0] as string;
          const bucket = this.fuzzyBuckets.get(bucketKey);
          const candidate = { entry, key: primary };
          if (bucket) bucket.push(candidate);
          else this.fuzzyBuckets.set(bucketKey, [candidate]);
          const stem = stemKey(primary);
          if (stem) pushTo(this.byStem, stem, entry);
        }
      });
    }
    this.entryCount = entries;
    this.streetCount = streets.length;
  }

  /** Every indexed name (full labels and slash parts). */
  get list(): readonly IndexedEntry[] {
    return this.all;
  }

  /**
   * Cascade lookup: K0 exact -> K1 cosmetic -> K2 variant -> bounded fuzzy.
   * `locality` (K1-normalized) only affects ranking and the inLocality flag.
   */
  lookup(name: string, locality?: string): MatchResult | null {
    const exact = this.byK0.get(k0(name));
    if (exact) return this.result("exact", exact, locality);

    const cosmetic = this.byK1.get(k1(name));
    if (cosmetic) return this.result("cosmetic", cosmetic, locality);

    // k2() is expensive (NFD + regex + variant expansion); compute the keys once
    // and thread them through the variant/fuzzy/stem stages instead of 3× per lookup.
    const k2Keys = k2(name);
    for (const key of k2Keys) {
      const variant = this.byK2.get(key);
      if (variant) return this.result("variant", variant, locality);
    }

    return this.fuzzyLookup(k2Keys, locality) ?? this.stemLookup(k2Keys, locality);
  }

  /**
   * Way-type mismatch: same stem, different type word ("Chemin de la Guérite"
   * vs official "Route de la Guérite"). Only suggests when every candidate
   * carries the SAME official name - two officials sharing a stem (e.g.
   * "Rue du Moulin" and "Route du Moulin") stay ambiguous and unmatched.
   */
  private stemLookup(k2Keys: string[], locality?: string): MatchResult | null {
    const primary = k2Keys[0];
    if (!primary) return null;
    const stem = queryStem(primary);
    if (!stem) return null;
    const candidates = this.byStem.get(stem);
    if (!candidates) return null;
    const distinctNames = new Set(candidates.map((c) => k1(c.namePart)));
    if (distinctNames.size !== 1) return null;
    return this.result("stem", candidates, locality);
  }

  private fuzzyLookup(k2Keys: string[], locality?: string): MatchResult | null {
    const queryKey = k2Keys[0];
    if (!queryKey || queryKey.length < 3) return null;
    const maxDist = queryKey.length < 8 ? 1 : 2;
    const bucket = this.fuzzyBuckets.get(foldAccents(queryKey[0] as string)) ?? [];

    let best = maxDist + 1;
    const matchesByKey = new Map<string, IndexedEntry[]>();
    for (const { entry, key } of bucket) {
      if (Math.abs(key.length - queryKey.length) > FUZZY_LENGTH_SLACK) continue;
      const d = damerauLevenshtein(queryKey, key, maxDist);
      if (d > maxDist || d === 0) continue;
      if (d < best) {
        best = d;
        matchesByKey.clear();
      }
      if (d === best) pushTo(matchesByKey, key, entry);
    }
    if (best > maxDist) return null;
    // Ambiguous: two different official names at the same distance -> no suggestion.
    if (matchesByKey.size !== 1) return null;
    const candidates = [...matchesByKey.values()][0] as IndexedEntry[];
    const result = this.result("near", candidates, locality);
    result.distance = best;
    return result;
  }

  private result(level: MatchLevel, candidates: IndexedEntry[], locality?: string): MatchResult {
    const sorted = [...candidates].sort((a, b) => rankScore(b, locality) - rankScore(a, locality));
    return {
      level,
      entry: sorted[0] as IndexedEntry,
      candidates: sorted,
      inLocality: locality ? sorted.some((c) => c.locality === locality) : true,
    };
  }
}
