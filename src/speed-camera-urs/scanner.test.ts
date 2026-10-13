import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteMessaged, resetMessagedForTests } from "./close";
import { makeSdk, makeSegment, makeTrafficLightUr, makeUr } from "./fake-sdk";
import { Scanner, type ScanSnapshot } from "./scanner";

const comment = { createdOn: 0, text: "hello", userName: null };

beforeEach(() => resetMessagedForTests());

describe("Scanner.rescan", () => {
  it("keeps only open speed-camera URs inside the map extent, oldest first", async () => {
    const urs = [
      makeUr(1, { reportedOn: 300 }),
      makeUr(2, { reportedOn: 100 }),
      makeUr(3, { isOpen: false }),
      makeUr(4, { description: "Missing road" }),
      makeUr(5, { geometry: { type: "Point", coordinates: [8.5, 47.3] } }),
    ];
    const scanner = new Scanner(makeSdk(urs).sdk);

    await scanner.rescan();

    expect(scanner.getSnapshot().entries.map((e) => e.id)).toEqual([2, 1]);
  });

  it("shows URs as pending first, then sorts them once their conversation is read", async () => {
    const { sdk } = makeSdk([makeUr(1), makeUr(2)], {
      comments: { 2: [comment] },
    });
    const scanner = new Scanner(sdk);
    const snapshots: ScanSnapshot[] = [];
    scanner.onUpdate((snapshot) => snapshots.push(snapshot));

    await scanner.rescan();

    expect(snapshots[0]?.entries.map((e) => e.triage)).toEqual([
      "pending",
      "pending",
    ]);
    expect(scanner.getSnapshot().entries.map((e) => e.triage)).toEqual([
      "ready",
      "conversation",
    ]);
  });

  it("reads each conversation once, until the UR is reported as changed", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)]);
    const scanner = new Scanner(sdk);

    await scanner.rescan();
    await scanner.rescan();
    expect(calls).toEqual(["details:1"]);

    scanner.forget([1]);
    await scanner.rescan();
    expect(calls).toEqual(["details:1", "details:1"]);
  });

  it("keeps a UR pending when its details fail, and retries", async () => {
    const failDetails = [1];
    const { sdk, calls } = makeSdk([makeUr(1)], { failDetails });
    const scanner = new Scanner(sdk);

    await scanner.rescan();
    expect(scanner.getSnapshot().entries[0]?.triage).toBe("pending");

    failDetails.length = 0;
    await scanner.rescan();
    expect(calls).toEqual(["details:1", "details:1"]);
    expect(scanner.getSnapshot().entries[0]?.triage).toBe("ready");
  });

  it("puts a UR this session already messaged under conversation, even if cached ready", async () => {
    const { sdk } = makeSdk([makeUr(1)]);
    const scanner = new Scanner(sdk);
    await scanner.rescan();

    noteMessaged(1);
    await scanner.rescan();

    expect(scanner.getSnapshot().entries[0]?.triage).toBe("conversation");
  });

  it("carries the reporter's language and position", async () => {
    const ur = makeUr(1, { userPreferences: { language: "deutsch" } as never });
    const scanner = new Scanner(makeSdk([ur]).sdk);

    await scanner.rescan();

    expect(scanner.getSnapshot().entries[0]).toMatchObject({
      lang: "de",
      lon: 6.6,
      lat: 46.5,
    });
  });

  it("does not cache a read that a change overtook", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)]);
    const original = sdk.DataModel.MapUpdateRequests.getUpdateRequestDetails;
    let resolveRead: (
      value: Awaited<ReturnType<typeof original>>,
    ) => void = () => {};
    sdk.DataModel.MapUpdateRequests.getUpdateRequestDetails = vi.fn(
      () => new Promise((resolve) => (resolveRead = resolve)),
    ) as typeof original;
    const scanner = new Scanner(sdk);

    const scan = scanner.rescan();
    scanner.forget([1]);
    resolveRead({ comments: [] } as never);
    await scan;

    expect(scanner.getSnapshot().entries[0]?.triage).toBe("pending");

    sdk.DataModel.MapUpdateRequests.getUpdateRequestDetails = original;
    await scanner.rescan();
    expect(calls).toEqual(["details:1"]);
    expect(scanner.getSnapshot().entries[0]?.triage).toBe("ready");
  });
});

describe("Scanner traffic lights", () => {
  it("lists traffic-light URs next to a freeway, apart from the speed cameras", async () => {
    const urs = [
      makeUr(1),
      makeTrafficLightUr(2, { reportedOn: 200 }),
      makeTrafficLightUr(3, { reportedOn: 100 }),
      // Next to the ramp only.
      makeTrafficLightUr(4, {
        geometry: { type: "Point", coordinates: [6.65, 46.6] },
      }),
    ];
    const segments = [
      makeSegment(3, 46.5001),
      makeSegment(4, 46.6001, [6.64, 6.66]),
    ];
    const scanner = new Scanner(makeSdk(urs, { segments }).sdk);

    await scanner.rescan();

    const snapshot = scanner.getSnapshot();
    expect(snapshot.entries.map((e) => e.id)).toEqual([1]);
    expect(snapshot.trafficLights.map((e) => e.id)).toEqual([3, 2]);
  });

  it("never reads the conversation of a traffic light", async () => {
    const { sdk, calls } = makeSdk([makeTrafficLightUr(1)], {
      segments: [makeSegment(3, 46.5001)],
    });

    await new Scanner(sdk).rescan();

    expect(calls).toEqual([]);
  });

  it("rescans when segments load, so a UR shown before its road still appears", () => {
    const { sdk } = makeSdk([]);
    new Scanner(sdk).start();

    expect(sdk.Events.trackDataModelEvents).toHaveBeenCalledWith({
      dataModelName: "segments",
    });
  });
});

const DAY = 24 * 60 * 60 * 1000;
/** 30 days after makeUr's default reportedOn. */
const NOW = 1_760_000_000_000 + 30 * DAY;
const road = { description: "Missing road" };
const mapTeam = { createdOn: 0, text: "auto", userName: "Map_Team" };
const stateOf = (snapshot: ScanSnapshot) =>
  snapshot.stale.map((e) => [e.id, e.state]);

describe("Scanner abandoned URs", () => {
  it("reads nothing and lists nothing while the box is unchecked", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)]);
    const scanner = new Scanner(sdk, { now: () => NOW });

    await scanner.rescan();

    expect(calls).toEqual([]);
    expect(scanner.getSnapshot().stale).toEqual([]);
  });

  it("lists old URs where nobody but Map_Team wrote, pending until read", async () => {
    const urs = [
      makeUr(1, road),
      makeUr(2, road),
      makeUr(3, { ...road, reportedOn: NOW - DAY }),
    ];
    const { sdk } = makeSdk(urs, {
      comments: { 1: [mapTeam], 2: [mapTeam, comment] },
    });
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadStale(true);
    const snapshots: ScanSnapshot[] = [];
    scanner.onUpdate((snapshot) => snapshots.push(snapshot));

    await scanner.rescan();

    expect(stateOf(snapshots[0]!)).toEqual([
      [1, "pending"],
      [2, "pending"],
    ]);
    expect(stateOf(scanner.getSnapshot())).toEqual([[1, "stale"]]);
  });

  it("reads the speed cameras' conversations first", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road), makeUr(2)]);
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadStale(true);

    await scanner.rescan();

    expect(calls).toEqual(["details:2", "details:1"]);
  });

  it("never lists a speed camera as abandoned, whatever its age", async () => {
    const scanner = new Scanner(makeSdk([makeUr(1)]).sdk, { now: () => NOW });
    scanner.setReadStale(true);

    await scanner.rescan();

    expect(scanner.getSnapshot().stale).toEqual([]);
    expect(scanner.getSnapshot().entries.map((e) => e.id)).toEqual([1]);
  });

  it("never lists a traffic light on a freeway, but takes one elsewhere", async () => {
    const urs = [
      makeTrafficLightUr(1),
      makeTrafficLightUr(2, {
        geometry: { type: "Point", coordinates: [6.65, 46.6] },
      }),
    ];
    const segments = [
      makeSegment(3, 46.5001),
      makeSegment(4, 46.6001, [6.64, 6.66]),
    ];
    const scanner = new Scanner(makeSdk(urs, { segments }).sdk, {
      now: () => NOW,
    });
    scanner.setReadStale(true);

    await scanner.rescan();

    expect(scanner.getSnapshot().trafficLights.map((e) => e.id)).toEqual([1]);
    expect(stateOf(scanner.getSnapshot())).toEqual([[2, "stale"]]);
  });

  it("drops a candidate that gains a comment", async () => {
    const comments: Record<number, Array<typeof comment>> = {};
    const { sdk } = makeSdk([makeUr(1, road)], { comments });
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadStale(true);
    await scanner.rescan();
    expect(stateOf(scanner.getSnapshot())).toEqual([[1, "stale"]]);

    comments[1] = [comment];
    scanner.forget([1]);
    await scanner.rescan();

    expect(scanner.getSnapshot().stale).toEqual([]);
  });

  it("stops reading once unchecked, and keeps what it already read", async () => {
    const urs = [makeUr(1, road)];
    const { sdk, calls } = makeSdk(urs);
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadStale(true);
    await scanner.rescan();
    expect(calls).toEqual(["details:1"]);

    scanner.setReadStale(false);
    urs.push(makeUr(2, road));
    await scanner.rescan();
    expect(calls).toEqual(["details:1"]);
    expect(scanner.getSnapshot().stale).toEqual([]);

    scanner.setReadStale(true);
    await scanner.rescan();
    expect(calls).toEqual(["details:1", "details:2"]);
    expect(stateOf(scanner.getSnapshot())).toEqual([
      [1, "stale"],
      [2, "stale"],
    ]);
  });
});
