import { beforeEach, describe, expect, it } from "vitest";
import {
  allowedBatch,
  BATCH_CAP,
  canBatch,
  canBatchStale,
  capBatch,
  closeMany,
  closeStale,
  alreadyMessaged,
  closeOne,
  closeTrafficLight,
  resetMessagedForTests,
  summarize,
  wasMessaged,
} from "./close";
import { makeSdk, makeSegment, makeTrafficLightUr, makeUr } from "./fake-sdk";
import { buildMessage } from "./message";

const comment = { createdOn: 0, text: "is it fixed?", userName: "editor" };

beforeEach(() => resetMessagedForTests());

describe("closeOne", () => {
  it("sends the message in the reporter's language, then closes as not-identified", async () => {
    const ur = makeUr(1, { userPreferences: { language: "deutsch" } as never });
    const { sdk, calls, sent } = makeSdk([ur]);

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(calls).toEqual(["details:1", "comment:1", "close:1:not-identified"]);
    expect(sent).toEqual([{ id: 1, text: buildMessage("de") }]);
    expect(wasMessaged(1)).toBe(true);
  });

  it("does not close when the message fails to go out", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { failComment: [1] });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errComment" });
    expect(calls).toEqual(["details:1", "comment:1"]);
    expect(wasMessaged(1)).toBe(false);
  });

  it("reports a closure failure after a successful send", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { failClose: [1] });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errClose" });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when the conversation cannot be read", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { failDetails: [1] });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errDetails" });
    expect(calls).toEqual(["details:1"]);
  });

  it("skips a UR that already has a comment, unless told otherwise", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { comments: { 1: [comment] } });

    const skipped = await closeOne(sdk, 1, { allowConversation: false });
    expect(skipped).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(calls).toEqual(["details:1"]);

    const forced = await closeOne(sdk, 1, { allowConversation: true });
    expect(forced).toEqual({ id: 1, result: "closed" });
  });

  it("skips a UR closed in the meantime, without reading or sending anything", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, { isOpen: false })]);

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "skipped", reason: "skipGone" });
    expect(calls).toEqual([]);
  });

  it("skips a UR that no longer exists in the data model", async () => {
    const { sdk } = makeSdk([]);
    expect(await closeOne(sdk, 9, { allowConversation: false })).toEqual({
      id: 9,
      result: "skipped",
      reason: "skipGone",
    });
  });

  it("refuses when editing is not allowed", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { editingAllowed: false });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({
      id: 1,
      result: "failed",
      reason: "errNotAllowed",
    });
    expect(calls).toEqual([]);
  });

  it("refuses to message twice after an undo", async () => {
    // Ctrl+Z reopens the UR, but the comment is already out and the cached conversation
    // (empty in this fake) does not show it.
    const ur = makeUr(1);
    const { sdk, sent } = makeSdk([ur]);
    await closeOne(sdk, 1, { allowConversation: false });
    ur.isOpen = true;

    const again = await closeOne(sdk, 1, { allowConversation: false });

    expect(again).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(sent).toHaveLength(1);
  });
});

describe("closeOne, repeated or overlapping", () => {
  it("sends once when two calls overlap on the same UR", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)]);

    const outcomes = await Promise.all([
      closeOne(sdk, 1, { allowConversation: false }),
      closeOne(sdk, 1, { allowConversation: false }),
    ]);

    expect(sent).toHaveLength(1);
    expect(outcomes.map((o) => o.result).sort()).toEqual(["closed", "skipped"]);
    expect(outcomes).toContainEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
  });

  it("closes without re-sending when an undone UR is forced through", async () => {
    const ur = makeUr(1);
    const { sdk, sent, calls } = makeSdk([ur]);
    await closeOne(sdk, 1, { allowConversation: false });
    ur.isOpen = true;

    const again = await closeOne(sdk, 1, { allowConversation: true });

    expect(again).toEqual({ id: 1, result: "closed" });
    expect(sent).toHaveLength(1);
    expect(calls.filter((c) => c === "close:1:not-identified")).toHaveLength(2);
  });
});

describe("a conversation that already holds our message", () => {
  const official = {
    createdOn: 0,
    text: buildMessage("de"),
    userName: "editor",
  };

  it("closes without sending when the editor forces it through", async () => {
    const { sdk, sent, calls } = makeSdk([makeUr(1)], {
      comments: { 1: [official] },
    });

    const outcome = await closeOne(sdk, 1, { allowConversation: true });

    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(sent).toEqual([]);
    expect(calls).toContain("close:1:not-identified");
  });

  it("is skipped by the batch", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { comments: { 1: [official] } });

    const outcomes = await closeMany(sdk, { speedCamera: [1], stale: [] });

    expect(outcomes).toEqual([
      { id: 1, result: "skipped", reason: "skipConversation" },
    ]);
    expect(sent).toEqual([]);
  });
});

describe("alreadyMessaged", () => {
  it("is true for our text in any comment, false for others", () => {
    expect(alreadyMessaged(77, [])).toBe(false);
    expect(
      alreadyMessaged(77, [{ createdOn: 0, text: "hi", userName: null }]),
    ).toBe(false);
    expect(
      alreadyMessaged(77, [
        { createdOn: 0, text: buildMessage("it"), userName: null },
      ]),
    ).toBe(true);
  });
});

describe("canBatch", () => {
  it("needs rank 2 (displayed level 3)", () => {
    expect(canBatch(makeSdk([], { rank: 2 }).sdk)).toBe(true);
    expect(canBatch(makeSdk([], { rank: 1 }).sdk)).toBe(false);
  });

  it("treats an unknown rank as insufficient", () => {
    expect(canBatch(makeSdk([], { rank: null }).sdk)).toBe(false);
  });
});

describe("closeMany", () => {
  it("refuses below level 3, whatever the caller", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { rank: 1 });

    expect(await closeMany(sdk, { speedCamera: [1], stale: [] })).toBeNull();
    expect(calls).toEqual([]);
  });

  it(`handles at most ${BATCH_CAP} URs`, async () => {
    const urs = Array.from({ length: BATCH_CAP + 10 }, (_, i) => makeUr(i + 1));
    const { sdk, sent } = makeSdk(urs);

    const outcomes = await closeMany(sdk, {
      speedCamera: urs.map((ur) => ur.id),
      stale: [],
    });

    expect(outcomes).toHaveLength(BATCH_CAP);
    expect(sent).toHaveLength(BATCH_CAP);
  });

  it("never sends to a UR with a comment and keeps going after a failure", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeUr(2), makeUr(3)], {
      comments: { 2: [comment] },
      failComment: [1],
    });

    const outcomes = await closeMany(sdk, {
      speedCamera: [1, 2, 3],
      stale: [],
    });

    expect(outcomes?.map((o) => o.result)).toEqual([
      "failed",
      "skipped",
      "closed",
    ]);
    expect(sent.map((s) => s.id)).toEqual([3]);
  });
});

describe("summarize", () => {
  it("counts the results, names each problem and reminds to save", () => {
    const text = summarize([
      { id: 1, result: "closed" },
      { id: 2, result: "skipped", reason: "skipGone" },
      { id: 3, result: "failed", reason: "errComment" },
    ]);

    expect(text).toContain("1 closed, 1 skipped, 1 failed.");
    expect(text).toContain("UR #2: already closed or no longer editable");
    expect(text).toContain("UR #3: the message could not be sent");
    expect(text).toContain("Save to record the closures.");
  });

  it("does not claim messages were sent when the closures sent none", () => {
    const text = summarize([{ id: 1, result: "closed" }], {
      messagesSent: false,
    });
    expect(text).toContain("Save to record the closures.");
    expect(text).not.toContain("already sent");
  });

  it("does not ask to save when nothing was closed", () => {
    const text = summarize([{ id: 2, result: "skipped", reason: "skipGone" }]);
    expect(text).not.toContain("Save");
  });
});

describe("closeTrafficLight", () => {
  const freeway = [makeSegment(3, 46.5001)];

  it("closes as not-identified and sends nothing", async () => {
    const { sdk, calls, sent } = makeSdk([makeTrafficLightUr(1)], {
      segments: freeway,
    });

    const outcome = await closeTrafficLight(sdk, 1);

    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(calls).toEqual(["close:1:not-identified"]);
    expect(sent).toEqual([]);
  });

  it("checks the freeway again before writing", async () => {
    const segments = [...freeway];
    const { sdk, calls } = makeSdk([makeTrafficLightUr(1)], { segments });
    // The segment was re-typed or unloaded since the list was drawn.
    segments.splice(0, 1, makeSegment(4, 46.5001));

    const outcome = await closeTrafficLight(sdk, 1);

    expect(outcome).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipNotFreeway",
    });
    expect(calls).toEqual([]);
  });

  it("skips a UR closed meanwhile, and refuses a speed-camera UR", async () => {
    const { sdk, calls } = makeSdk(
      [makeTrafficLightUr(1, { isOpen: false }), makeUr(2)],
      { segments: freeway },
    );

    expect(await closeTrafficLight(sdk, 1)).toMatchObject({
      reason: "skipGone",
    });
    expect(await closeTrafficLight(sdk, 2)).toMatchObject({
      reason: "skipGone",
    });
    expect(calls).toEqual([]);
  });

  it("writes nothing when editing is not allowed", async () => {
    const { sdk, calls } = makeSdk([makeTrafficLightUr(1)], {
      segments: freeway,
      editingAllowed: false,
    });

    expect(await closeTrafficLight(sdk, 1)).toMatchObject({
      reason: "errNotAllowed",
    });
    expect(calls).toEqual([]);
  });

  it("is out of the batch's reach", async () => {
    const { sdk, calls, sent } = makeSdk([makeTrafficLightUr(1)], {
      segments: freeway,
    });

    const outcomes = await closeMany(sdk, { speedCamera: [1], stale: [] });

    expect(outcomes).toEqual([
      { id: 1, result: "skipped", reason: "skipGone" },
    ]);
    expect(calls).toEqual([]);
    expect(sent).toEqual([]);
  });
});

const DAY = 24 * 60 * 60 * 1000;
/** 30 days after makeUr's default reportedOn. */
const NOW = 1_760_000_000_000 + 30 * DAY;
const road = { description: "Missing road" };
const mapTeam = { createdOn: 0, text: "auto", userName: "Map_Team" };

describe("closeStale", () => {
  it("closes as not-identified without any message, Map_Team comments allowed", async () => {
    const { sdk, calls, sent } = makeSdk([makeUr(1, road)], {
      comments: { 1: [mapTeam] },
    });

    expect(await closeStale(sdk, 1, NOW)).toEqual({ id: 1, result: "closed" });
    expect(calls).toEqual(["details:1", "close:1:not-identified"]);
    expect(sent).toEqual([]);
    expect(sdk.DataModel.MapUpdateRequests.addComment).not.toHaveBeenCalled();
  });

  it("re-reads the conversation and skips a UR someone wrote on meanwhile", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)], {
      comments: { 1: [mapTeam, comment] },
    });

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(calls).toEqual(["details:1"]);
  });

  it("skips, without reading anything, a UR that is no longer a candidate", async () => {
    const urs = [
      makeUr(1, { ...road, reportedOn: NOW - DAY }),
      makeUr(2, { ...road, isOpen: false }),
      makeUr(3),
    ];
    const { sdk, calls } = makeSdk(urs);

    for (const id of [1, 2, 3, 4]) {
      expect(await closeStale(sdk, id, NOW)).toEqual({
        id,
        result: "skipped",
        reason: "skipGone",
      });
    }
    expect(calls).toEqual([]);
  });

  it("refuses a traffic light that sits on a freeway", async () => {
    const { sdk, calls } = makeSdk([makeTrafficLightUr(1)], {
      segments: [makeSegment(3, 46.5001)],
    });

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipGone",
    });
    expect(calls).toEqual([]);
  });

  it("refuses a Map Mate voice report", async () => {
    const mapMate = makeUr(1, { ...road, source: "REPORTING_AGENT" });
    const { sdk, calls } = makeSdk([mapMate]);

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipGone",
    });
    expect(calls).toEqual([]);
  });

  it("refuses a traffic light whose road is not loaded", async () => {
    const { sdk, calls } = makeSdk([makeTrafficLightUr(1)]);

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipGone",
    });
    expect(calls).toEqual([]);
  });

  it("writes nothing when the conversation cannot be read", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)], { failDetails: [1] });

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "failed",
      reason: "errDetails",
    });
    expect(calls).toEqual(["details:1"]);
  });

  it("writes nothing when editing is not allowed", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)], {
      editingAllowed: false,
    });

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "failed",
      reason: "errNotAllowed",
    });
    expect(calls).toEqual([]);
  });

  it("reports a closure failure", async () => {
    const { sdk } = makeSdk([makeUr(1, road)], { failClose: [1] });

    expect(await closeStale(sdk, 1, NOW)).toEqual({
      id: 1,
      result: "failed",
      reason: "errClose",
    });
  });
});

describe("canBatchStale", () => {
  it("needs rank 3 (displayed level 4)", () => {
    expect(canBatchStale(makeSdk([], { rank: 3 }).sdk)).toBe(true);
    expect(canBatchStale(makeSdk([], { rank: 2 }).sdk)).toBe(false);
  });

  it("treats an unknown rank as insufficient", () => {
    expect(canBatchStale(makeSdk([], { rank: null }).sdk)).toBe(false);
    expect(
      allowedBatch(makeSdk([], { rank: null }).sdk, {
        speedCamera: [1],
        stale: [2],
      }),
    ).toEqual({ speedCamera: [], stale: [] });
  });
});

describe("capBatch", () => {
  it("caps the whole batch, speed cameras first", () => {
    const speedCamera = Array.from({ length: 40 }, (_, i) => i + 1);
    const stale = Array.from({ length: 20 }, (_, i) => i + 101);

    const capped = capBatch({ speedCamera, stale });

    expect(capped.speedCamera).toHaveLength(40);
    expect(capped.stale).toEqual(stale.slice(0, BATCH_CAP - 40));
  });
});

describe("closeMany with abandoned URs", () => {
  it("drops the abandoned URs below level 4 and keeps the speed cameras at level 3", async () => {
    const { sdk, calls } = makeSdk([makeUr(1), makeUr(2, road)], { rank: 2 });

    const outcomes = await closeMany(
      sdk,
      { speedCamera: [1], stale: [2] },
      NOW,
    );

    expect(outcomes?.map((o) => o.id)).toEqual([1]);
    expect(calls).not.toContain("details:2");
  });

  it("refuses an abandoned-only batch below level 4", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)], { rank: 2 });

    expect(
      await closeMany(sdk, { speedCamera: [], stale: [1] }, NOW),
    ).toBeNull();
    expect(calls).toEqual([]);
  });

  it("shares the cap, speed cameras first, and never messages an abandoned UR", async () => {
    const cameras = Array.from({ length: 40 }, (_, i) => makeUr(i + 1));
    const old = Array.from({ length: 20 }, (_, i) => makeUr(i + 101, road));
    const { sdk, sent } = makeSdk([...cameras, ...old], { rank: 3 });

    const outcomes = await closeMany(
      sdk,
      { speedCamera: cameras.map((u) => u.id), stale: old.map((u) => u.id) },
      NOW,
    );

    expect(outcomes).toHaveLength(BATCH_CAP);
    expect(outcomes?.slice(40).map((o) => o.id)).toEqual(
      old.slice(0, 10).map((u) => u.id),
    );
    expect(outcomes?.every((o) => o.result === "closed")).toBe(true);
    expect(sent.map((s) => s.id)).toEqual(cameras.map((u) => u.id));
  });
});
