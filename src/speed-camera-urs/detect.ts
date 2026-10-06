import { point, pointToLineDistance } from "@turf/turf";
import type {
  ConversationElement,
  MapUpdateRequest,
  Segment,
} from "wme-sdk-typings";

/**
 * Every speed-camera UR observed in WME starts its description with this marker, followed
 * by free text whose wording and language vary. Their type is always
 * INCORRECT_GENERAL_ERROR, so the type cannot tell them apart from anything else.
 */
export const SPEED_CAMERA_PREFIX = "MISSING_STATIC_SPEED_CAMERA";

type UrFields = Pick<MapUpdateRequest, "description" | "isOpen" | "isEditable">;

export function isSpeedCameraUr(ur: UrFields): boolean {
  const description = ur.description ?? "";
  return (
    ur.isOpen && ur.isEditable && description.startsWith(SPEED_CAMERA_PREFIX)
  );
}

/**
 * Some reporters get round the missing speed-camera report by reporting a traffic light
 * instead. On a freeway there is none to report, so there the marker means a speed camera.
 * Elsewhere it may well be a real light, which is why these URs also need isOnFreeway.
 */
export const TRAFFIC_LIGHT_PREFIX = "MISSING_TRAFFIC_LIGHT";

export function isTrafficLightUr(ur: UrFields): boolean {
  const description = ur.description ?? "";
  return (
    ur.isOpen && ur.isEditable && description.startsWith(TRAFFIC_LIGHT_PREFIX)
  );
}

/** ROAD_TYPE.FREEWAY in the SDK; the typings declare the constant but ship no runtime value. */
const FREEWAY_ROAD_TYPE = 3;

/**
 * How far a UR may sit from the freeway. Reports land a few metres off the road, where the
 * driver was when tapping, but beyond this the closest road is a guess.
 */
export const FREEWAY_MAX_DISTANCE_M = 30;

type SegmentFields = Pick<Segment, "geometry" | "roadType">;

/** About 110 m north-south and 75 m east-west in Switzerland: well beyond the limit. */
const BBOX_MARGIN_DEG = 0.001;

/**
 * A cheap pre-check before the exact distance. The scan runs on every segment event, and
 * comparing a few URs with every loaded segment through turf adds up while editing.
 */
function bboxNear(segment: SegmentFields, lon: number, lat: number): boolean {
  const coords = segment.geometry.coordinates;
  const lons = coords.map((c) => c[0] ?? 0);
  const lats = coords.map((c) => c[1] ?? 0);
  return (
    lon >= Math.min(...lons) - BBOX_MARGIN_DEG &&
    lon <= Math.max(...lons) + BBOX_MARGIN_DEG &&
    lat >= Math.min(...lats) - BBOX_MARGIN_DEG &&
    lat <= Math.max(...lats) + BBOX_MARGIN_DEG
  );
}

/**
 * Whether the closest loaded segment is a freeway. The closest one decides, not any freeway
 * in range: ramps are excluded on purpose, real traffic lights stand at their far end, and
 * a UR next to one belongs to the ramp even when the freeway runs a few metres further.
 *
 * The SDK links a UR to no segment, hence the geometry. A UR whose segments are not loaded
 * yet is not on a freeway; the scanner looks again when they arrive.
 */
export function isOnFreeway(
  ur: Pick<MapUpdateRequest, "geometry">,
  segments: readonly SegmentFields[],
): boolean {
  const [lon, lat] = ur.geometry.coordinates;
  if (lon === undefined || lat === undefined) return false;
  const where = point([lon, lat]);
  let closestType: number | null = null;
  let closestDistance = FREEWAY_MAX_DISTANCE_M;
  for (const segment of segments) {
    if (!bboxNear(segment, lon, lat)) continue;
    const distance = pointToLineDistance(where, segment.geometry, {
      units: "meters",
    });
    if (distance > closestDistance) continue;
    closestDistance = distance;
    closestType = segment.roadType;
  }
  return closestType === FREEWAY_ROAD_TYPE;
}

/** `extent` is the map's GeoJSON bbox: [west, south, east, north]. */
export function isInExtent(
  ur: Pick<MapUpdateRequest, "geometry">,
  extent: readonly number[],
): boolean {
  const [lon, lat] = ur.geometry.coordinates;
  const [west, south, east, north] = extent;
  if (lon === undefined || lat === undefined) return false;
  if (
    west === undefined ||
    south === undefined ||
    east === undefined ||
    north === undefined
  ) {
    return false;
  }
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

export type Triage = "ready" | "conversation";

/**
 * Whether a UR may go into a batch.
 *
 * ANY comment counts, not only an editor's. None of the URs observed while designing this
 * carried a comment, so nobody has seen how `userName` tells the reporter from an editor;
 * guessing wrong would mean messaging over someone's ongoing conversation. The common case
 * (no comment) still goes through the batch, the rest is seen by a human.
 */
export function triage(
  comments: readonly ConversationElement[],
  messagedBySelf: boolean,
): Triage {
  if (messagedBySelf) return "conversation";
  return comments.length > 0 ? "conversation" : "ready";
}
