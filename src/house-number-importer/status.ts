import type { GwrPoint } from "./gwr/types";
import { matchesSegmentStreet, type MatchStrictness } from "./matching";

export type PointStatus =
  /** Same street as the selection, and no house number carries that number yet. */
  | "MISSING"
  /** The number is already on the street. */
  | "PRESENT"
  /** The address belongs to another street. */
  | "OTHER_STREET"
  /** No segment selected, or its existing numbers are still loading. */
  | "NEUTRAL";

export interface StatusedPoint {
  point: GwrPoint;
  status: PointStatus;
}

/**
 * Comparable form of a house number: "15 a", "15A" and "15a" are the same number.
 * Hyphens and slashes are kept, so "15-17" stays distinct from "15".
 */
export function normalizeNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export interface StatusInput {
  points: GwrPoint[];
  /**
   * Names of the selected segment (primary and alternates), or null when nothing is
   * selected. Null forces every point to NEUTRAL.
   */
  segmentNames: string[] | null;
  /** Numbers already on the street, normalized. Null while the fetch is still in flight. */
  existingNumbers: ReadonlySet<string> | null;
  strictness?: MatchStrictness;
}

/**
 * Classify every address point against the current selection.
 *
 * `existingNumbers` being null is deliberately not the same as it being empty: the SDK
 * only reads house numbers asynchronously, and painting a point as MISSING before that
 * answer arrives invites the editor to create a duplicate during the round trip. Until it
 * resolves, matching points stay NEUTRAL and the click stays inert.
 */
export function computeStatuses(input: StatusInput): StatusedPoint[] {
  const { points, segmentNames, existingNumbers, strictness = "strict" } = input;
  if (!segmentNames || segmentNames.length === 0) {
    return points.map((point) => ({ point, status: "NEUTRAL" as const }));
  }

  return points.map((point) => {
    if (!matchesSegmentStreet(point.streetNames, segmentNames, strictness)) {
      return { point, status: "OTHER_STREET" as const };
    }
    if (!existingNumbers) return { point, status: "NEUTRAL" as const };
    const status = existingNumbers.has(normalizeNumber(point.number)) ? "PRESENT" : "MISSING";
    return { point, status };
  });
}

/** The points a bulk import would create, in printed-number order. */
export function missingPoints(statused: StatusedPoint[]): GwrPoint[] {
  return statused
    .filter((entry) => entry.status === "MISSING")
    .map((entry) => entry.point)
    .sort((a, b) => compareHouseNumbers(a.number, b.number));
}

/** Numeric part first, so a recap reads "2, 4, 10" rather than "10, 2, 4". */
export function compareHouseNumbers(a: string, b: string): number {
  const numericA = Number.parseInt(a, 10);
  const numericB = Number.parseInt(b, 10);
  if (Number.isFinite(numericA) && Number.isFinite(numericB) && numericA !== numericB) {
    return numericA - numericB;
  }
  return normalizeNumber(a).localeCompare(normalizeNumber(b));
}
