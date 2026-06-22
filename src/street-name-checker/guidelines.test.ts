import type { LineString } from "geojson";
import type { Segment, SegmentAddress } from "wme-sdk-typings";
import { describe, expect, it } from "vitest";
import { evaluateGuidelines } from "./guidelines";
import type { IssueStatus } from "./matching/evaluate";

const GEOMETRY: LineString = {
  type: "LineString",
  coordinates: [
    [6.63, 46.52],
    [6.64, 46.52],
  ],
};

let nextId = 1;

function seg(overrides: Partial<Segment> = {}): Segment {
  return {
    id: nextId++,
    roadType: 1,
    junctionId: null,
    length: 100,
    geometry: GEOMETRY,
    fromNodeId: nextId * 100,
    toNodeId: nextId * 100 + 1,
    isAtoB: false,
    isBtoA: false,
    isTwoWay: true,
    primaryStreetId: null,
    alternateStreetIds: [],
    ...overrides,
  } as unknown as Segment;
}

const noAddress = (): SegmentAddress | null => null;
const frenchAddress = (): SegmentAddress | null =>
  ({ street: null, city: null, state: null, country: { id: 2, abbr: "FR", name: "France" }, isEmpty: true, altStreets: [] }) as unknown as SegmentAddress;

function statusOf(issues: ReturnType<typeof evaluateGuidelines>, segmentId: number): IssueStatus | undefined {
  return issues.find((i) => i.segmentId === segmentId)?.status;
}

describe("MICRO_SEGMENT", () => {
  it("flags drivable segments under 5 m", () => {
    const s = seg({ length: 3 } as Partial<Segment>);
    expect(statusOf(evaluateGuidelines([s], noAddress), s.id)).toBe("MICRO_SEGMENT");
  });

  it("ignores roundabout segments", () => {
    const s = seg({ length: 3, junctionId: 7 } as Partial<Segment>);
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("ignores non-drivable types (walking trail)", () => {
    const s = seg({ length: 3, roadType: 5 } as Partial<Segment>);
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("ignores segments of 5 m and more", () => {
    const s = seg({ length: 5 } as Partial<Segment>);
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });
});

describe("country guard", () => {
  it("ignores foreign segments when the Swiss id is known", () => {
    const s = seg({ length: 3 } as Partial<Segment>);
    expect(evaluateGuidelines([s], frenchAddress, 1)).toHaveLength(0);
  });

  it("fails open when the Swiss id is unknown", () => {
    const s = seg({ length: 3 } as Partial<Segment>);
    expect(evaluateGuidelines([s], frenchAddress, null)).toHaveLength(1);
  });
});

describe("LOOP", () => {
  it("flags one-segment loops (same node at both ends)", () => {
    const s = seg({ fromNodeId: 1, toNodeId: 1 } as Partial<Segment>);
    expect(statusOf(evaluateGuidelines([s], noAddress), s.id)).toBe("LOOP");
  });

  it("flags both members of a two-segment loop, regardless of direction", () => {
    const a = seg({ fromNodeId: 1, toNodeId: 2 } as Partial<Segment>);
    const b = seg({ fromNodeId: 2, toNodeId: 1 } as Partial<Segment>);
    const issues = evaluateGuidelines([a, b], noAddress);
    expect(statusOf(issues, a.id)).toBe("LOOP");
    expect(statusOf(issues, b.id)).toBe("LOOP");
  });

  it("does not flag ordinary parallel-free segments", () => {
    const a = seg({ fromNodeId: 1, toNodeId: 2 } as Partial<Segment>);
    const b = seg({ fromNodeId: 2, toNodeId: 3 } as Partial<Segment>);
    expect(evaluateGuidelines([a, b], noAddress)).toHaveLength(0);
  });

  it("ignores roundabout segments sharing endpoints", () => {
    const a = seg({ fromNodeId: 1, toNodeId: 2, junctionId: 9 } as Partial<Segment>);
    const b = seg({ fromNodeId: 2, toNodeId: 1, junctionId: 9 } as Partial<Segment>);
    expect(evaluateGuidelines([a, b], noAddress)).toHaveLength(0);
  });
});

describe("NARROW_MISUSE", () => {
  it("flags one-way narrow streets", () => {
    const s = seg({ roadType: 22, isAtoB: true, isBtoA: false, isTwoWay: false, length: 80 } as Partial<Segment>);
    expect(statusOf(evaluateGuidelines([s], noAddress), s.id)).toBe("NARROW_MISUSE");
  });

  it("flags narrow streets under 50 m", () => {
    const s = seg({ roadType: 22, isTwoWay: true, length: 30 } as Partial<Segment>);
    expect(statusOf(evaluateGuidelines([s], noAddress), s.id)).toBe("NARROW_MISUSE");
  });

  it("accepts a two-way narrow street of 50 m or more", () => {
    const s = seg({ roadType: 22, isTwoWay: true, length: 60 } as Partial<Segment>);
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });
});

describe("lock level (UNDER_LOCK / OVER_LOCK)", () => {
  // Notes are in 1-6 levels; segment.lockRank is 0-based, so level = lockRank + 1.
  it("flags a segment locked below the Swiss standard", () => {
    const s = seg({ roadType: 7, lockRank: 0 } as Partial<Segment>); // Minor Highway L1, expects L3
    const issues = evaluateGuidelines([s], noAddress);
    expect(statusOf(issues, s.id)).toBe("UNDER_LOCK");
    const found = issues.find((i) => i.segmentId === s.id);
    expect(found?.note).toMatchObject({ currentLock: 1, expectedLock: 3 });
    expect(found?.fixable).toBe(true);
  });

  it("flags a segment locked above the Swiss standard", () => {
    const s = seg({ roadType: 2, lockRank: 4 } as Partial<Segment>); // Primary Street L5, expects L2
    const issues = evaluateGuidelines([s], noAddress);
    expect(statusOf(issues, s.id)).toBe("OVER_LOCK");
    const found = issues.find((i) => i.segmentId === s.id);
    expect(found?.note).toMatchObject({ currentLock: 5, expectedLock: 2 });
    expect(found?.fixable).toBe(true);
  });

  it("accepts a segment locked exactly at the expected level", () => {
    const s = seg({ roadType: 6, lockRank: 3 } as Partial<Segment>); // Major Highway L4, expects L4
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("accepts a Street correctly at level 1 (lockRank 0)", () => {
    const s = seg({ roadType: 1, lockRank: 0 } as Partial<Segment>); // Street L1, expects L1
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("never checks ramps (lock follows connectivity, not a flat table)", () => {
    const s = seg({ roadType: 4, lockRank: 0 } as Partial<Segment>);
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("ignores road types outside the lock table", () => {
    const s = seg({ roadType: 8, lockRank: 0 } as Partial<Segment>); // Off-road, not listed
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("does not apply Swiss lock rules to foreign segments", () => {
    const s = seg({ roadType: 3, lockRank: 0 } as Partial<Segment>); // would be UNDER_LOCK in CH
    expect(evaluateGuidelines([s], frenchAddress, 1)).toHaveLength(0);
  });
});

describe("structural flag (lock decoupled from guideline checks)", () => {
  it("runs only the lock check when structural is false", () => {
    const micro = seg({ roadType: 1, length: 3, lockRank: 0 } as Partial<Segment>); // would be MICRO_SEGMENT
    const underLock = seg({ roadType: 7, lockRank: 0 } as Partial<Segment>); // UNDER_LOCK
    const issues = evaluateGuidelines([micro, underLock], noAddress, null, { structural: false });
    // micro has a name-free geometry problem but structural checks are off
    expect(statusOf(issues, micro.id)).toBeUndefined();
    expect(statusOf(issues, underLock.id)).toBe("UNDER_LOCK");
  });

  it("still runs structural checks by default (structural defaults to true)", () => {
    const micro = seg({ roadType: 1, length: 3 } as Partial<Segment>);
    expect(statusOf(evaluateGuidelines([micro], noAddress), micro.id)).toBe("MICRO_SEGMENT");
  });
});

describe("roundabout lock minimum (L3)", () => {
  const lockIssue = (issues: ReturnType<typeof evaluateGuidelines>, id: number) =>
    issues.find((i) => i.segmentId === id);

  it("flags a roundabout below L3 as UNDER_LOCK with expected L3", () => {
    const s = seg({ junctionId: 7, lockRank: 0 } as Partial<Segment>); // Street roundabout at L1
    const issue = lockIssue(evaluateGuidelines([s], noAddress), s.id);
    expect(issue?.status).toBe("UNDER_LOCK");
    expect(issue?.note?.expectedLock).toBe(3);
    expect(issue?.note?.currentLock).toBe(1);
  });

  it("does not flag a roundabout already at L3", () => {
    const s = seg({ junctionId: 7, lockRank: 2 } as Partial<Segment>); // L3
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("does not flag a roundabout above L3 (the floor is a minimum, no OVER_LOCK)", () => {
    const s = seg({ junctionId: 7, lockRank: 3 } as Partial<Segment>); // L4
    expect(evaluateGuidelines([s], noAddress)).toHaveLength(0);
  });

  it("keeps the roundabout floor on a higher-standard road type", () => {
    const s = seg({ junctionId: 7, roadType: 6, lockRank: 2 } as Partial<Segment>); // Major Hwy roundabout at L3, expected L4
    expect(statusOf(evaluateGuidelines([s], noAddress), s.id)).toBe("UNDER_LOCK");
  });

  it("still flags a non-roundabout Street over its standard as OVER_LOCK", () => {
    const s = seg({ lockRank: 3 } as Partial<Segment>); // Street at L4, expected L1
    expect(statusOf(evaluateGuidelines([s], noAddress), s.id)).toBe("OVER_LOCK");
  });
});
