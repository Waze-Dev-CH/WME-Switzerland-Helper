import type { WmeSDK } from "wme-sdk-typings";
import type { Bbox } from "../geoadmin/types";
import { k1 } from "../street-name-checker/matching/normalize";
import { log } from "./log";
import { normalizeNumber } from "./status";

/** Segments whose geometry reaches this far outside the area still count as neighbours. */
const NEIGHBOUR_PADDING_DEG = 0.0008; // ~60 m at Swiss latitudes
/** Enough to cover a long street; keeps the work bounded on a dense city view. */
const MAX_SCOPED_SEGMENTS = 40;

/** Primary and alternate street names of a segment, blanks removed. */
export function segmentStreetNames(sdk: WmeSDK, segmentId: number): string[] {
  try {
    const address = sdk.DataModel.Segments.getAddress({ segmentId });
    const names = [address.street?.name, ...address.altStreets.map((alt) => alt.street?.name)];
    return names.filter((name): name is string => typeof name === "string" && name.trim() !== "");
  } catch (err) {
    log.warn(`Could not read the address of segment ${segmentId}`, err);
    return [];
  }
}

function bboxOfLine(coordinates: number[][]): Bbox | null {
  if (coordinates.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function intersects(a: Bbox, b: Bbox, padding: number): boolean {
  const overlapsLon = a[0] - padding <= b[2] && a[2] + padding >= b[0];
  const overlapsLat = a[1] - padding <= b[3] && a[3] + padding >= b[1];
  return overlapsLon && overlapsLat;
}

/**
 * Every loaded segment carrying the same street name as the selected one and lying in the
 * area, the selected one first.
 *
 * WME splits a street at each junction, so number 15 may well sit on the segment next
 * door. Asking only about the selected segment reports it as missing and recreates it, and
 * the duplicate stays invisible until someone opens the house-number layer. This reads the
 * already-loaded data model, so it costs no request.
 */
export function collectStreetScopedSegmentIds(
  sdk: WmeSDK,
  selectedSegmentId: number,
  area: Bbox,
): number[] {
  const names = segmentStreetNames(sdk, selectedSegmentId);
  if (names.length === 0) return [selectedSegmentId];
  const keys = new Set(names.map(k1));

  const scoped: number[] = [];
  for (const segment of sdk.DataModel.Segments.getAll()) {
    if (segment.id === selectedSegmentId) continue;
    if (scoped.length >= MAX_SCOPED_SEGMENTS - 1) break;
    const bounds = bboxOfLine(segment.geometry.coordinates);
    if (!bounds || !intersects(bounds, area, NEIGHBOUR_PADDING_DEG)) continue;
    if (!segmentStreetNames(sdk, segment.id).some((name) => keys.has(k1(name)))) continue;
    scoped.push(segment.id);
  }
  return [selectedSegmentId, ...scoped];
}

/**
 * Numbers already posted on those segments, normalized for comparison.
 *
 * `fetchHouseNumbers` is the only way to read them: the SDK exposes neither `getAll` nor
 * `getById` on HouseNumbers, and the house-number events carry an id nothing can resolve.
 * Rejection is propagated rather than swallowed: an empty set would read as "nothing
 * exists yet" and invite a duplicate for every number on the street.
 */
export async function fetchExistingNumbers(
  sdk: WmeSDK,
  segmentIds: number[],
): Promise<Set<string>> {
  if (segmentIds.length === 0) return new Set();
  try {
    const houseNumbers = await sdk.DataModel.HouseNumbers.fetchHouseNumbers({ segmentIds });
    return new Set(houseNumbers.map((houseNumber) => normalizeNumber(houseNumber.number)));
  } catch (err) {
    log.warn("Could not read the existing house numbers", err);
    throw err;
  }
}
