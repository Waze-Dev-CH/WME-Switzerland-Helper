import type { WmeSDK } from "wme-sdk-typings";
import { distancePointToSegmentM } from "../street-name-checker/matching/spatial";
import type { GwrPoint } from "./gwr/types";
import { log } from "./log";

/** Metres between an address point and the closest part of a polyline. */
export function distanceToSegmentM(coordinates: number[][], point: GwrPoint): number {
  let min = Infinity;
  for (let i = 0; i + 1 < coordinates.length; i++) {
    const distance = distancePointToSegmentM(
      [point.lon, point.lat],
      coordinates[i] as number[],
      coordinates[i + 1] as number[],
    );
    if (distance < min) min = distance;
  }
  return min;
}

export interface Assignment {
  point: GwrPoint;
  /** The segment this number will hang from. */
  segmentId: number;
  distanceM: number;
}

export interface AssignmentResult {
  assignments: Assignment[];
  /** Points with no segment of that street within reach; nothing can be said about them. */
  unreachable: GwrPoint[];
}

export type SegmentGeometries = ReadonlyMap<number, number[][]>;

/** Read the geometry of each candidate once, so the matching below stays arithmetic. */
export function readSegmentGeometries(sdk: WmeSDK, segmentIds: number[]): SegmentGeometries {
  const geometries = new Map<number, number[][]>();
  for (const segmentId of segmentIds) {
    try {
      const coordinates = sdk.DataModel.Segments.getById({ segmentId })?.geometry.coordinates;
      if (coordinates && coordinates.length > 1) geometries.set(segmentId, coordinates);
    } catch (err) {
      log.warn(`Could not read the geometry of segment ${segmentId}`, err);
    }
  }
  return geometries;
}

/**
 * Hang each address on the nearest segment OF ITS OWN STREET.
 *
 * WME splits a street at every junction, so the numbers of one street belong to several
 * segments. Attaching them all to the selected one puts number 2 four hundred metres from
 * the segment it is meant to sit on, which is exactly what the distance guard rejects.
 *
 * Restricting the candidates to segments carrying the street's name is what separates this
 * from WME's own "closest segment wins": on a corner building the nearest road is often the
 * cross street, and that is the mistake the reference userscript makes.
 */
export function assignToSegments(
  points: GwrPoint[],
  geometries: SegmentGeometries,
  maxDistanceM: number,
): AssignmentResult {
  const assignments: Assignment[] = [];
  const unreachable: GwrPoint[] = [];

  for (const point of points) {
    let best: Assignment | null = null;
    for (const [segmentId, coordinates] of geometries) {
      const distanceM = distanceToSegmentM(coordinates, point);
      if (!best || distanceM < best.distanceM) best = { point, segmentId, distanceM };
    }
    if (best && best.distanceM <= maxDistanceM) assignments.push(best);
    else unreachable.push(point);
  }

  return { assignments, unreachable };
}

/** How many distinct segments a batch would touch, for the confirmation recap. */
export function countSegments(assignments: Assignment[]): number {
  return new Set(assignments.map((assignment) => assignment.segmentId)).size;
}
