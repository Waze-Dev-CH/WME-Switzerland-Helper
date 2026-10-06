import { describe, expect, it } from "vitest";
import {
  isInExtent,
  isOnFreeway,
  isSpeedCameraUr,
  isTrafficLightUr,
  triage,
} from "./detect";
import { makeSegment, makeTrafficLightUr, makeUr } from "./fake-sdk";

describe("isSpeedCameraUr", () => {
  it("accepts an open, editable UR whose description starts with the marker", () => {
    expect(isSpeedCameraUr(makeUr(1))).toBe(true);
  });

  it("ignores the free text after the marker, whatever its language", () => {
    const portuguese = makeUr(1, {
      description: "MISSING_STATIC_SPEED_CAMERA: Radar fixo",
    });
    expect(isSpeedCameraUr(portuguese)).toBe(true);
  });

  it("rejects a marker that is not at the start", () => {
    const quoted = makeUr(1, {
      description: "see MISSING_STATIC_SPEED_CAMERA",
    });
    expect(isSpeedCameraUr(quoted)).toBe(false);
  });

  it("rejects a closed UR, a UR the editor cannot edit and a UR without description", () => {
    expect(isSpeedCameraUr(makeUr(1, { isOpen: false }))).toBe(false);
    expect(isSpeedCameraUr(makeUr(1, { isEditable: false }))).toBe(false);
    expect(isSpeedCameraUr(makeUr(1, { description: null }))).toBe(false);
  });
});

describe("isInExtent", () => {
  const extent = [6, 46, 7, 47];

  it("keeps a UR inside the extent, edges included", () => {
    expect(isInExtent(makeUr(1), extent)).toBe(true);
    const onEdge = makeUr(1, {
      geometry: { type: "Point", coordinates: [7, 47] },
    });
    expect(isInExtent(onEdge, extent)).toBe(true);
  });

  it("drops a UR outside the extent", () => {
    const outside = makeUr(1, {
      geometry: { type: "Point", coordinates: [8.5, 47.3] },
    });
    expect(isInExtent(outside, extent)).toBe(false);
  });
});

describe("triage", () => {
  it("is ready without any comment", () => {
    expect(triage([], false)).toBe("ready");
  });

  it("is a conversation as soon as there is one comment, whoever wrote it", () => {
    expect(
      triage([{ createdOn: 0, text: "hello", userName: null }], false),
    ).toBe("conversation");
    expect(
      triage([{ createdOn: 0, text: "hi", userName: "editor" }], false),
    ).toBe("conversation");
  });

  it("is a conversation when this session already sent the message", () => {
    expect(triage([], true)).toBe("conversation");
  });
});

describe("isTrafficLightUr", () => {
  it("accepts an open, editable UR whose description starts with the marker", () => {
    expect(isTrafficLightUr(makeTrafficLightUr(1))).toBe(true);
  });

  it("rejects a speed-camera UR, a closed one and one the editor cannot edit", () => {
    expect(isTrafficLightUr(makeUr(1))).toBe(false);
    expect(isTrafficLightUr(makeTrafficLightUr(1, { isOpen: false }))).toBe(
      false,
    );
    expect(isTrafficLightUr(makeTrafficLightUr(1, { isEditable: false }))).toBe(
      false,
    );
  });
});

describe("isOnFreeway", () => {
  const ur = makeTrafficLightUr(1);
  // 0.0001° of latitude is about 11 m.
  const near = 46.5001;
  const far = 46.5005;

  it("is true when the closest loaded segment is a freeway", () => {
    expect(isOnFreeway(ur, [makeSegment(3, near)])).toBe(true);
  });

  it("is false when the closest segment is a ramp, even with a freeway a bit further", () => {
    const segments = [makeSegment(4, 46.50005), makeSegment(3, 46.5002)];
    expect(isOnFreeway(ur, segments)).toBe(false);
  });

  it("is false when the closest freeway is beyond the distance limit", () => {
    expect(isOnFreeway(ur, [makeSegment(3, far)])).toBe(false);
  });

  it("is false when no segment is loaded", () => {
    expect(isOnFreeway(ur, [])).toBe(false);
  });
});
