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

/** Past this age with nobody but Map_Team in the conversation, the reporter is not coming back. */
export const STALE_AGE_DAYS = 14;

/**
 * Author of the automatic comments WME adds to a UR. They are not a conversation: nobody
 * is waiting for an answer to them. Exact match on purpose: any other spelling is treated
 * as a person, which keeps the UR out of the batch rather than in it.
 */
export const MAP_TEAM_USER = "Map_Team";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Source of the URs created by Map Mate, Waze's voice reporting (observed in WME on a UR
 * labelled "Map Mate (signalement vocal)"). Their description often carries what the driver
 * actually said, so silence in the conversation does not make them abandoned.
 */
export const MAP_MATE_SOURCE = "REPORTING_AGENT";

export type MapMateKind =
  | "trafficLight"
  | "route"
  | "speedLimit"
  | "turn"
  | "railroadCrossing"
  | "general";

/** The order quotes and labels follow. */
export const MAP_MATE_KINDS: readonly MapMateKind[] = [
  "trafficLight",
  "route",
  "speedLimit",
  "turn",
  "railroadCrossing",
  "general",
];

/**
 * Codes Map Mate puts before the first ":" of its description. A Map rather than an
 * object literal: "constructor" or "toString" must not look up a prototype function.
 */
const MAP_MATE_CODES = new Map<string, MapMateKind>([
  [TRAFFIC_LIGHT_PREFIX, "trafficLight"],
  ["INCORRECT_ROUTE", "route"],
  ["INCORRECT_SPEED_LIMIT", "speedLimit"],
  ["INCORRECT_TURN", "turn"],
  ["RAILROAD_CROSSING", "railroadCrossing"],
  ["GENERAL_MAP_UPDATE", "general"],
]);

export function descriptionCode(description: string | null): string {
  return (description ?? "").split(":")[0] ?? "";
}

/**
 * Which question a Map Mate report gets, or null for none. An unknown code gets nothing:
 * a generic question would be worse than silence. The road is not checked here; a traffic
 * light also needs isKnownOffFreeway, which the caller applies.
 */
export function mapMateKind(
  ur: UrFields & Pick<MapUpdateRequest, "source" | "updateRequestType">,
): MapMateKind | null {
  const mapMate =
    ur.isOpen &&
    ur.isEditable &&
    ur.source === MAP_MATE_SOURCE &&
    ur.updateRequestType === "INCORRECT_GENERAL_ERROR";
  if (!mapMate) return null;
  return MAP_MATE_CODES.get(descriptionCode(ur.description)) ?? null;
}

export function ageInDays(reportedOn: number, now: number): number {
  return Math.floor((now - reportedOn) / DAY_MS);
}

/**
 * An open UR old enough to be abandoned, read from the data model alone. The final verdict
 * also needs the conversation (isAbandoned), which costs a server round trip.
 *
 * Speed cameras are excluded here rather than by the caller: they always get the official
 * message, and must not slip into a family that closes without one.
 */
export function isStaleCandidate(
  ur: UrFields & Pick<MapUpdateRequest, "reportedOn" | "source">,
  now: number,
): boolean {
  const description = ur.description ?? "";
  const oldEnough = now - ur.reportedOn > STALE_AGE_DAYS * DAY_MS;
  const speedCamera = description.startsWith(SPEED_CAMERA_PREFIX);
  const mapMate = ur.source === MAP_MATE_SOURCE;
  return ur.isOpen && ur.isEditable && oldEnough && !speedCamera && !mapMate;
}

/**
 * Who wrote a comment, as observed in WME: the automatic messages carry "Map_Team", an
 * editor carries their name, and the reporter, who has no editor account, comes back with
 * userName null or "admin" (UR 27179414), probably depending on how they answered. "admin"
 * has no editor profile, so it cannot be an editor.
 */
const REPORTER_NAMES: ReadonlyArray<string | null> = [null, "admin"];

function isReporter(comment: ConversationElement): boolean {
  return REPORTER_NAMES.includes(comment.userName);
}

/** Anyone but Map_Team, the reporter included. */
export function hasDiscussion(
  comments: readonly ConversationElement[],
): boolean {
  return comments.some((comment) => comment.userName !== MAP_TEAM_USER);
}

/** The latest comment by date, or the report itself when nobody wrote. */
export function lastActivity(
  reportedOn: number,
  comments: readonly ConversationElement[],
): number {
  return Math.max(reportedOn, ...comments.map((comment) => comment.createdOn));
}

/**
 * The final verdict on a stale candidate, once its conversation is read: nothing has
 * happened for STALE_AGE_DAYS, and the reporter does not have the last word. When they
 * do, someone owes them an answer. A question from Map_Team or an editor left unanswered
 * is exactly what this family closes.
 */
export function isAbandoned(
  comments: readonly ConversationElement[],
  reportedOn: number,
  now: number,
): boolean {
  const latest = [...comments].sort((a, b) => a.createdOn - b.createdOn).pop();
  if (latest && isReporter(latest)) return false;
  return now - lastActivity(reportedOn, comments) > STALE_AGE_DAYS * DAY_MS;
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
 * Road type of the closest loaded segment within FREEWAY_MAX_DISTANCE_M, or null when none
 * is loaded there. The SDK links a UR to no segment, hence the geometry.
 */
function closestRoadType(
  ur: Pick<MapUpdateRequest, "geometry">,
  segments: readonly SegmentFields[],
): number | null {
  const [lon, lat] = ur.geometry.coordinates;
  if (lon === undefined || lat === undefined) return null;
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
  return closestType;
}

/**
 * Whether the closest loaded segment is a freeway. The closest one decides, not any freeway
 * in range: ramps are excluded on purpose, real traffic lights stand at their far end, and
 * a UR next to one belongs to the ramp even when the freeway runs a few metres further.
 *
 * A UR whose segments are not loaded yet is not on a freeway; the scanner looks again when
 * they arrive.
 */
export function isOnFreeway(
  ur: Pick<MapUpdateRequest, "geometry">,
  segments: readonly SegmentFields[],
): boolean {
  return closestRoadType(ur, segments) === FREEWAY_ROAD_TYPE;
}

/**
 * Whether a traffic-light UR may be treated as abandoned: only once the road under it is
 * loaded and is not a freeway. "Not loaded" must not count as "not a freeway" here, unlike
 * in isOnFreeway: a freeway light would then reach a batch, which that family never does.
 */
export function isKnownOffFreeway(
  ur: Pick<MapUpdateRequest, "geometry">,
  segments: readonly SegmentFields[],
): boolean {
  const type = closestRoadType(ur, segments);
  return type !== null && type !== FREEWAY_ROAD_TYPE;
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
