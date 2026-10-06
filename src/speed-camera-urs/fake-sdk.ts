/**
 * A stand-in for the few SDK calls this feature makes, shared by its test files. Never
 * imported by production code, so it stays out of the bundle.
 */
import { vi } from "vitest";
import type {
  ConversationElement,
  MapUpdateRequest,
  Segment,
  WmeSDK,
} from "wme-sdk-typings";

export function makeUr(
  id: number,
  overrides: Partial<MapUpdateRequest> = {},
): MapUpdateRequest {
  return {
    id,
    description:
      "MISSING_STATIC_SPEED_CAMERA: The user reported a fixed speed camera.",
    isOpen: true,
    isEditable: true,
    isRead: false,
    isStarred: false,
    reportedOn: 1_760_000_000_000,
    resolutionState: "open",
    resolvedBy: null,
    resolvedOn: null,
    severity: "low",
    source: "MOBILE_CLIENT",
    updateRequestType: "INCORRECT_GENERAL_ERROR",
    geometry: { type: "Point", coordinates: [6.6, 46.5] },
    userPreferences: {
      language: "francais",
    } as MapUpdateRequest["userPreferences"],
    ...overrides,
  };
}

/** A traffic-light UR, placed on the freeway segment of `freewayAt`. */
export function makeTrafficLightUr(
  id: number,
  overrides: Partial<MapUpdateRequest> = {},
): MapUpdateRequest {
  return makeUr(id, {
    description: "MISSING_TRAFFIC_LIGHT: The user reported a traffic light.",
    ...overrides,
  });
}

/**
 * A straight east-west segment through `lat`, wide enough to cover the default UR position.
 * Road type 3 is FREEWAY.
 */
export function makeSegment(
  roadType: number,
  lat = 46.5,
  lon: [number, number] = [6.59, 6.61],
): Segment {
  return {
    roadType,
    geometry: {
      type: "LineString",
      coordinates: [
        [lon[0], lat],
        [lon[1], lat],
      ],
    },
  } as Segment;
}

export interface FakeOptions {
  /** Editor rank (0-based). `null` means no user info at all. Defaults to 2 (level 3). */
  rank?: number | null;
  editingAllowed?: boolean;
  /** Read at call time, so a test can add a comment while a flow is running. */
  comments?: Record<number, ConversationElement[]>;
  failDetails?: number[];
  failComment?: number[];
  failClose?: number[];
  extent?: number[];
  /** Loaded segments. Read at call time, so a test can change them mid-flow. */
  segments?: Segment[];
}

export function makeSdk(urs: MapUpdateRequest[], options: FakeOptions = {}) {
  const calls: string[] = [];
  const sent: Array<{ id: number; text: string }> = [];
  const byId = (id: number) => urs.find((ur) => ur.id === id) ?? null;
  type IdArgs = { mapUpdateRequestId: number };

  const sdk = {
    Editing: { isEditingAllowed: () => options.editingAllowed ?? true },
    State: {
      getUserInfo: () =>
        options.rank === null ? null : { rank: options.rank ?? 2 },
    },
    Map: {
      getMapExtent: () => options.extent ?? [6, 46, 7, 47],
      setMapCenter: vi.fn(),
    },
    Events: { on: vi.fn(), trackDataModelEvents: vi.fn() },
    DataModel: {
      Segments: { getAll: () => options.segments ?? [] },
      MapUpdateRequests: {
        getAll: () => urs,
        getById: ({ mapUpdateRequestId }: IdArgs) => byId(mapUpdateRequestId),
        getUpdateRequestDetails: vi.fn(
          async ({ mapUpdateRequestId: id }: IdArgs) => {
            calls.push(`details:${id}`);
            if (options.failDetails?.includes(id))
              throw new Error("details failed");
            if (!byId(id)) return null;
            return {
              id,
              comments: options.comments?.[id] ?? [],
              driveGeometry: null,
            };
          },
        ),
        addComment: vi.fn(
          async ({
            mapUpdateRequestId: id,
            text,
          }: IdArgs & { text: string }) => {
            calls.push(`comment:${id}`);
            if (options.failComment?.includes(id))
              throw new Error("comment failed");
            sent.push({ id, text });
            return { createdOn: 0, text, userName: "editor" };
          },
        ),
        updateResolutionState: vi.fn(
          ({
            mapUpdateRequestId: id,
            resolutionState,
          }: IdArgs & { resolutionState: string }) => {
            calls.push(`close:${id}:${resolutionState}`);
            if (options.failClose?.includes(id))
              throw new Error("close failed");
            const ur = byId(id);
            if (ur) {
              ur.isOpen = false;
              ur.resolutionState =
                resolutionState as MapUpdateRequest["resolutionState"];
            }
          },
        ),
      },
    },
  } as unknown as WmeSDK;

  return { sdk, calls, sent };
}
