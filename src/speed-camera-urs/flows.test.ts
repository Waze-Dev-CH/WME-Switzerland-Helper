import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationElement } from "wme-sdk-typings";
import {
  closeOne,
  isCloseInFlight,
  resetMessagedForTests,
  runCloseAll,
  runCloseOne,
} from "./close";
import type { ConfirmSpec } from "./confirm-spec";
import { makeSdk, makeUr } from "./fake-sdk";
import { buildMessage } from "./message";

const official = {
  createdOn: 0,
  text: buildMessage("de"),
  userName: "editor",
};
const comment = { createdOn: 0, text: "still there", userName: null };
const accept = () =>
  vi.fn<(spec: ConfirmSpec) => Promise<boolean>>(async () => true);
const decline = () =>
  vi.fn<(spec: ConfirmSpec) => Promise<boolean>>(async () => false);
/** The confirmation the flow asked for. */
const specOf = (confirm: ReturnType<typeof accept>): ConfirmSpec => {
  const spec = confirm.mock.calls[0]?.[0];
  if (!spec) throw new Error("confirm was not called");
  return spec;
};
const silent = () => vi.fn<(message: string) => Promise<void>>(async () => {});

beforeEach(() => resetMessagedForTests());

describe("runCloseOne", () => {
  it("shows the language and the exact message before sending", async () => {
    const ur = makeUr(1, {
      userPreferences: { language: "italiano" } as never,
    });
    const { sdk, sent } = makeSdk([ur]);
    const confirm = accept();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(outcome).toEqual({ id: 1, result: "closed" });
    const spec = specOf(confirm);
    expect(spec.quotes?.options).toEqual([
      { lang: "it", text: buildMessage("it") },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(sent).toHaveLength(1);
  });

  it("warns about an existing conversation and still lets the editor send", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { comments: { 1: [comment] } });
    const confirm = accept();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).previousComment?.label).toContain(
      "already has a conversation",
    );
    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(sent).toHaveLength(1);
  });

  it("does nothing when the editor declines", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)]);

    expect(
      await runCloseOne(sdk, 1, { confirm: decline(), notify: silent() }),
    ).toBeNull();
    expect(calls).toEqual(["details:1"]);
  });

  it("skips when a comment arrives while the dialog is open", async () => {
    const comments: Record<number, ConversationElement[]> = {};
    const { sdk, sent } = makeSdk([makeUr(1)], { comments });
    const confirm = vi.fn(async () => {
      comments[1] = [comment];
      return true;
    });
    const notify = silent();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify });

    expect(outcome).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(sent).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("tells the editor when it fails", async () => {
    const { sdk } = makeSdk([makeUr(1)], { failComment: [1] });
    const notify = silent();

    await runCloseOne(sdk, 1, { confirm: accept(), notify });

    expect(notify.mock.calls[0]?.[0]).toContain(
      "the message could not be sent",
    );
  });
  it("shows the last comment when a conversation exists, trimmed to 200 characters", async () => {
    const long = { ...comment, text: `${"x".repeat(250)}` };
    const { sdk } = makeSdk([makeUr(1)], {
      comments: { 1: [comment, long] },
    });
    const confirm = accept();

    await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).previousComment?.text).toBe(`${"x".repeat(200)}…`);
  });

  it("shows the last comment in full when it is short", async () => {
    const { sdk } = makeSdk([makeUr(1)], { comments: { 1: [comment] } });
    const confirm = accept();

    await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).previousComment?.text).toBe("still there");
  });

  it("closes only, never re-sending, a UR whose conversation holds our message from an earlier session", async () => {
    const { sdk, sent, calls } = makeSdk([makeUr(1)], {
      comments: { 1: [official] },
    });
    const confirm = accept();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).facts.join(" ")).toContain(
      "without sending it again",
    );
    expect(specOf(confirm).quotes).toBeUndefined();
    expect(specOf(confirm).confirmLabel).toBe("Close");
    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(sent).toEqual([]);
    expect(calls).toContain("close:1:not-identified");
  });

  it('labels the close-only button "Close" for a UR messaged this session', async () => {
    const ur = makeUr(1);
    const { sdk } = makeSdk([ur]);
    await closeOne(sdk, 1, { allowConversation: false });
    ur.isOpen = true;
    const confirm = accept();

    await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).confirmLabel).toBe("Close");
  });

  it("offers to close without re-sending a UR this session already messaged", async () => {
    const ur = makeUr(1);
    const { sdk, sent } = makeSdk([ur]);
    await closeOne(sdk, 1, { allowConversation: false });
    // Simulated undo: the UR is open again, the reporter still has the message.
    ur.isOpen = true;
    const confirm = accept();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).facts.join(" ")).toContain(
      "without sending it again",
    );
    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(sent).toHaveLength(1);
  });
});

describe("runCloseAll", () => {
  it("refuses below level 3 without asking anything", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { rank: 1 });
    const confirm = accept();
    const notify = silent();

    expect(await runCloseAll(sdk, [1], { confirm, notify })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0]).toContain("level 3");
    expect(calls).toEqual([]);
  });

  it("states how many messages leave, in which languages, before sending", async () => {
    const urs = [
      makeUr(1),
      makeUr(2),
      makeUr(3, { userPreferences: { language: "deutsch" } as never }),
    ];
    const { sdk, sent } = makeSdk(urs);
    const confirm = accept();
    const notify = silent();

    const outcomes = await runCloseAll(sdk, [1, 2, 3], { confirm, notify });

    const spec = specOf(confirm);
    expect(spec.facts).toContain("Messages sent now: 3");
    expect(
      spec.quotes?.options.map(({ lang, count }) => ({ lang, count })),
    ).toEqual([
      { lang: "fr", count: 2 },
      { lang: "de", count: 1 },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(outcomes).toHaveLength(3);
    expect(sent).toHaveLength(3);
    expect(notify.mock.calls[0]?.[0]).toContain(
      "3 closed, 0 skipped, 0 failed.",
    );
    expect(notify.mock.calls[0]?.[0]).toContain("Save to record the closures.");
  });

  it("refuses before asking anything when editing is not allowed", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { editingAllowed: false });
    const confirm = accept();
    const notify = silent();

    expect(await runCloseAll(sdk, [1], { confirm, notify })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0]).toContain("nothing was sent");
    expect(sent).toEqual([]);
  });

  it("sends nothing when the editor declines", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)]);

    expect(
      await runCloseAll(sdk, [1], { confirm: decline(), notify: silent() }),
    ).toBeNull();
    expect(sent).toEqual([]);
  });

  it("refuses a second flow while one is running", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeUr(2)]);
    let release: (value: boolean) => void = () => {};
    const slowConfirm = vi.fn(
      () => new Promise<boolean>((resolve) => (release = resolve)),
    );

    const first = runCloseOne(sdk, 1, {
      confirm: slowConfirm,
      notify: silent(),
    });
    expect(isCloseInFlight()).toBe(true);
    const second = await runCloseAll(sdk, [2], {
      confirm: accept(),
      notify: silent(),
    });
    // `release` is only assigned once the first flow reaches its dialog.
    await vi.waitFor(() => expect(slowConfirm).toHaveBeenCalled());
    release(true);
    await first;

    expect(second).toBeNull();
    expect(sent.map((s) => s.id)).toEqual([1]);
    expect(isCloseInFlight()).toBe(false);
  });
});
