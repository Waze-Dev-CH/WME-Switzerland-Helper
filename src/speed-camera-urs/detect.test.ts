import { describe, expect, it } from "vitest";
import { isInExtent, isSpeedCameraUr, triage } from "./detect";
import { makeUr } from "./fake-sdk";

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
