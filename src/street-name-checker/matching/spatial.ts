import type { LineString } from "geojson";
import type { IndexedEntry } from "./official-index";

/**
 * Spatial matching between Waze segments and official street axes.
 * Planar approximation in meters (fine at street scale in Switzerland):
 * 1° lat ≈ 110.57 km, 1° lon ≈ 111.32 km × cos(lat).
 */

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON_EQUATOR = 111_320;
/** Grid cell ≈ 110 m × 77 m at Swiss latitudes; a 3×3 search covers maxMeters ≤ ~75 m. */
const GRID_DEG = 0.001;
/** Search radius: a Waze segment may lie on an official street within this distance. */
export const NEAR_STREET_M = 25;
/** Stricter ceiling for acting on a match (suggestions, wrong-street). */
export const SUGGEST_MAX_M = 20;
/** Beyond this distance a street is considered NOT under the segment. */
export const FAR_STREET_M = 40;
/** An official sub-segment must be roughly parallel to the local Waze direction. */
export const MAX_BEARING_DIFF_RAD = (35 * Math.PI) / 180;
/** The winning street must be the closest at this fraction of the samples. */
export const MIN_COVERAGE = 0.6;
/** Another street this close to the winner makes the result contested (abstain). */
export const CONTEST_MARGIN_M = 5;
/** WRONG_STREET demands the other street along nearly the whole segment. */
export const WRONG_STREET_MIN_COVERAGE = 0.8;

export function distancePointToSegmentM(p: number[], a: number[], b: number[]): number {
  const lonScale = M_PER_DEG_LON_EQUATOR * Math.cos(((p[1] as number) * Math.PI) / 180);
  const px = (p[0] as number) * lonScale;
  const py = (p[1] as number) * M_PER_DEG_LAT;
  const ax = (a[0] as number) * lonScale;
  const ay = (a[1] as number) * M_PER_DEG_LAT;
  const bx = (b[0] as number) * lonScale;
  const by = (b[1] as number) * M_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  }
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Undirected bearing of the a->b segment, radians in [0, π). */
function bearingOf(a: number[], b: number[]): number {
  const lonScale = Math.cos(((a[1] as number) * Math.PI) / 180);
  const dx = ((b[0] as number) - (a[0] as number)) * lonScale;
  const dy = (b[1] as number) - (a[1] as number);
  const angle = Math.atan2(dy, dx);
  return ((angle % Math.PI) + Math.PI) % Math.PI;
}

function bearingDiff(b1: number, b2: number): number {
  const d = Math.abs(b1 - b2) % Math.PI;
  return Math.min(d, Math.PI - d);
}

export interface NearestResult {
  entry: IndexedEntry;
  distanceM: number;
  /** Fraction of the segment's samples where this street was the closest. */
  coverage: number;
}

interface GridSegment {
  entry: IndexedEntry;
  a: number[];
  b: number[];
  bearing: number;
}

/** Grid over official street axis segments. */
export class SpatialIndex {
  private grid = new Map<string, GridSegment[]>();
  readonly size: number;

  /** Only full-label entries are indexed (slash parts share the same geometry). */
  constructor(entries: readonly IndexedEntry[]) {
    let count = 0;
    for (const entry of entries) {
      if (entry.isSlashPart) continue;
      const lines = entry.street.lines;
      if (!lines) continue;
      for (const line of lines) {
        for (let i = 0; i + 1 < line.length; i++) {
          const a = line[i] as number[];
          const b = line[i + 1] as number[];
          count++;
          const seg: GridSegment = { entry, a, b, bearing: bearingOf(a, b) };
          // register the segment in every cell its bbox touches
          const x0 = Math.floor(Math.min(a[0] as number, b[0] as number) / GRID_DEG);
          const x1 = Math.floor(Math.max(a[0] as number, b[0] as number) / GRID_DEG);
          const y0 = Math.floor(Math.min(a[1] as number, b[1] as number) / GRID_DEG);
          const y1 = Math.floor(Math.max(a[1] as number, b[1] as number) / GRID_DEG);
          for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
              const key = `${x}:${y}`;
              const cell = this.grid.get(key);
              if (cell) cell.push(seg);
              else this.grid.set(key, [seg]);
            }
          }
        }
      }
    }
    this.size = count;
  }

  /**
   * All streets within maxMeters of the point (one minimal distance per street),
   * restricted to sub-segments roughly parallel to `bearing` when provided.
   */
  candidatesAt(
    point: number[],
    maxMeters: number,
    bearing?: number,
  ): Map<number, { entry: IndexedEntry; distanceM: number }> {
    const cx = Math.floor((point[0] as number) / GRID_DEG);
    const cy = Math.floor((point[1] as number) / GRID_DEG);
    const byEsid = new Map<number, { entry: IndexedEntry; distanceM: number }>();
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const seg of this.grid.get(`${x}:${y}`) ?? []) {
          if (bearing !== undefined && bearingDiff(seg.bearing, bearing) > MAX_BEARING_DIFF_RAD) {
            continue;
          }
          const d = distancePointToSegmentM(point, seg.a, seg.b);
          if (d > maxMeters) continue;
          const esid = seg.entry.street.esid;
          const known = byEsid.get(esid);
          if (!known || d < known.distanceM) byEsid.set(esid, { entry: seg.entry, distanceM: d });
        }
      }
    }
    return byEsid;
  }
}

const SAMPLE_FRACTIONS = [0.1, 0.3, 0.5, 0.7, 0.9];

export interface SampleWithBearing {
  point: number[];
  /** Local direction of the Waze polyline at this sample, or null if degenerate. */
  bearing: number | null;
}

/**
 * Samples spread along the segment by ARC LENGTH, not by coordinate index:
 * Waze geometries concentrate vertices near curves and junctions, and
 * index-based sampling clustered every sample there (real false positive:
 * "Chemin de la Poste" in Avenches voted to the cross street at its junction).
 * Each sample carries the LOCAL bearing, so curved streets compare correctly.
 */
export function sampleWithBearings(geometry: LineString): SampleWithBearing[] {
  const coords = geometry.coordinates as number[][];
  if (coords.length === 0) return [];
  if (coords.length === 1) return [{ point: coords[0] as number[], bearing: null }];

  const lonScale = Math.cos((((coords[0] as number[])[1] as number) * Math.PI) / 180);
  const planar = (a: number[], b: number[]): number =>
    Math.hypot(((b[0] as number) - (a[0] as number)) * lonScale, (b[1] as number) - (a[1] as number));

  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(
      (cumulative[i - 1] as number) + planar(coords[i - 1] as number[], coords[i] as number[]),
    );
  }
  const total = cumulative[cumulative.length - 1] as number;
  if (total === 0) return [{ point: coords[0] as number[], bearing: null }];

  const fractions = coords.length === 2 ? [0.5] : SAMPLE_FRACTIONS;
  return fractions.map((fraction) => {
    const target = fraction * total;
    let i = 1;
    while (i < cumulative.length - 1 && (cumulative[i] as number) < target) i++;
    const before = cumulative[i - 1] as number;
    const stepLength = (cumulative[i] as number) - before;
    const t = stepLength > 0 ? (target - before) / stepLength : 0;
    const a = coords[i - 1] as number[];
    const b = coords[i] as number[];
    return {
      point: [
        (a[0] as number) + ((b[0] as number) - (a[0] as number)) * t,
        (a[1] as number) + ((b[1] as number) - (a[1] as number)) * t,
      ],
      bearing: stepLength > 0 || planar(a, b) > 0 ? bearingOf(a, b) : null,
    };
  });
}

export function samplePoints(geometry: LineString): number[][] {
  return sampleWithBearings(geometry).map((sample) => sample.point);
}

/**
 * Official street lying under the Waze segment. Guards against false positives:
 * - per-sample bearing filter (cross streets never compete),
 * - the winner must be the closest at >= MIN_COVERAGE of the samples,
 * - abstains when another street runs within CONTEST_MARGIN_M of the winner.
 */
export function nearestOfficial(
  geometry: LineString,
  index: SpatialIndex,
  maxMeters = NEAR_STREET_M,
): NearestResult | null {
  const samples = sampleWithBearings(geometry);
  if (samples.length === 0) return null;

  interface Tally {
    entry: IndexedEntry;
    wins: number;
    presence: number;
    minD: number;
  }
  const tallies = new Map<number, Tally>();
  for (const sample of samples) {
    const candidates = index.candidatesAt(sample.point, maxMeters, sample.bearing ?? undefined);
    let best: { esid: number; d: number } | null = null;
    for (const [esid, { entry, distanceM }] of candidates) {
      let tally = tallies.get(esid);
      if (!tally) {
        tally = { entry, wins: 0, presence: 0, minD: Infinity };
        tallies.set(esid, tally);
      }
      tally.presence++;
      tally.minD = Math.min(tally.minD, distanceM);
      if (!best || distanceM < best.d) best = { esid, d: distanceM };
    }
    if (best) (tallies.get(best.esid) as Tally).wins++;
  }

  let winner: Tally | null = null;
  for (const tally of tallies.values()) {
    if (!winner || tally.wins > winner.wins || (tally.wins === winner.wins && tally.minD < winner.minD)) {
      winner = tally;
    }
  }
  if (!winner || winner.wins === 0) return null;

  const coverage = winner.wins / samples.length;
  if (coverage < MIN_COVERAGE) return null;

  // Contested: another street present along the segment, nearly as close.
  for (const tally of tallies.values()) {
    if (tally === winner) continue;
    if (tally.presence >= 2 && tally.minD - winner.minD < CONTEST_MARGIN_M) return null;
  }

  return { entry: winner.entry, distanceM: winner.minD, coverage };
}

/** Minimal distance from the sample points to a set of polylines. */
export function distanceToLinesM(geometry: LineString, lines: number[][][]): number {
  let min = Infinity;
  for (const point of samplePoints(geometry)) {
    for (const line of lines) {
      for (let i = 0; i + 1 < line.length; i++) {
        min = Math.min(min, distancePointToSegmentM(point, line[i] as number[], line[i + 1] as number[]));
      }
    }
  }
  return min;
}

/** Minimal distance from the sample points to one specific official street. */
export function distanceToEntryM(geometry: LineString, entry: IndexedEntry): number {
  const lines = entry.street.lines;
  if (!lines) return Infinity;
  return distanceToLinesM(geometry, lines);
}
