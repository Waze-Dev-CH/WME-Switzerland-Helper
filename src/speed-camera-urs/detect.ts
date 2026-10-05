import type { ConversationElement, MapUpdateRequest } from "wme-sdk-typings";

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
