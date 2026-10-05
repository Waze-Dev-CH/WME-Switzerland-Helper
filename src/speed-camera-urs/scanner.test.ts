import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteMessaged, resetMessagedForTests } from "./close";
import { makeSdk, makeUr } from "./fake-sdk";
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
