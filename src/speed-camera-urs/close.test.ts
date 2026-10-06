import { beforeEach, describe, expect, it } from "vitest";
import {
  BATCH_CAP,
  canBatch,
  closeMany,
  alreadyMessaged,
  closeOne,
  closeTrafficLight,
  resetMessagedForTests,
  summarize,
  wasMessaged,
} from "./close";
import { makeSdk, makeSegment, makeTrafficLightUr, makeUr } from "./fake-sdk";
import { buildMessage } from "./message";

const comment = { createdOn: 0, text: "is it fixed?", userName: null };

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

    const outcomes = await closeMany(sdk, [1]);

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

    expect(await closeMany(sdk, [1])).toBeNull();
    expect(calls).toEqual([]);
  });

  it(`handles at most ${BATCH_CAP} URs`, async () => {
    const urs = Array.from({ length: BATCH_CAP + 10 }, (_, i) => makeUr(i + 1));
    const { sdk, sent } = makeSdk(urs);

    const outcomes = await closeMany(
      sdk,
      urs.map((ur) => ur.id),
    );

    expect(outcomes).toHaveLength(BATCH_CAP);
    expect(sent).toHaveLength(BATCH_CAP);
  });

  it("never sends to a UR with a comment and keeps going after a failure", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeUr(2), makeUr(3)], {
      comments: { 2: [comment] },
      failComment: [1],
    });

    const outcomes = await closeMany(sdk, [1, 2, 3]);

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

    const outcomes = await closeMany(sdk, [1]);

    expect(outcomes).toEqual([
      { id: 1, result: "skipped", reason: "skipGone" },
    ]);
    expect(calls).toEqual([]);
    expect(sent).toEqual([]);
  });
});
