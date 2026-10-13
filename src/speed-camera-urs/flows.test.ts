import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationElement } from "wme-sdk-typings";
import {
  closeOne,
  isCloseInFlight,
  resetMessagedForTests,
  runAskMapMate,
  runCloseOne,
  runCloseSelected,
  runCloseStale,
  runCloseTrafficLight,
} from "./close";
import type { ConfirmSpec } from "./confirm-spec";
import {
  makeMapMateUr,
  makeSdk,
  makeSegment,
  makeTrafficLightUr,
  makeUr,
} from "./fake-sdk";
import { Scanner } from "./scanner";
import { buildMapMateQuestion, buildMessage } from "./message";

const official = {
  createdOn: 0,
  text: buildMessage("de"),
  userName: "editor",
};
const comment = { createdOn: 0, text: "still there", userName: "editor" };
const DAY = 24 * 60 * 60 * 1000;
/** 30 days after makeUr's default reportedOn. */
const NOW = 1_760_000_000_000 + 30 * DAY;
const road = { description: "Missing road" };
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
    expect(spec.quotes?.[0]?.options).toEqual([
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

describe("runCloseSelected", () => {
  it("refuses below level 3 without asking anything", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { rank: 1 });
    const confirm = accept();
    const notify = silent();

    expect(
      await runCloseSelected(
        sdk,
        { speedCamera: [1], mapMate: [], stale: [] },
        { confirm, notify },
      ),
    ).toBeNull();
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

    const outcomes = await runCloseSelected(
      sdk,
      { speedCamera: [1, 2, 3], mapMate: [], stale: [] },
      { confirm, notify },
    );

    const spec = specOf(confirm);
    expect(spec.facts).toEqual([
      "3 speed camera(s): message sent now, then closed as Not identified",
    ]);
    expect(
      spec.quotes?.[0]?.options.map(({ lang, count }) => ({ lang, count })),
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
    expect(notify.mock.calls[0]?.[0]).toContain(
      "The messages are already sent.",
    );
  });

  it("refuses before asking anything when editing is not allowed", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { editingAllowed: false });
    const confirm = accept();
    const notify = silent();

    expect(
      await runCloseSelected(
        sdk,
        { speedCamera: [1], mapMate: [], stale: [] },
        { confirm, notify },
      ),
    ).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0]).toContain("nothing was sent");
    expect(sent).toEqual([]);
  });

  it("sends nothing when the editor declines", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)]);

    expect(
      await runCloseSelected(
        sdk,
        { speedCamera: [1], mapMate: [], stale: [] },
        { confirm: decline(), notify: silent() },
      ),
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
    const second = await runCloseSelected(
      sdk,
      { speedCamera: [2], mapMate: [], stale: [] },
      {
        confirm: accept(),
        notify: silent(),
      },
    );
    // `release` is only assigned once the first flow reaches its dialog.
    await vi.waitFor(() => expect(slowConfirm).toHaveBeenCalled());
    release(true);
    await first;

    expect(second).toBeNull();
    expect(sent.map((s) => s.id)).toEqual([1]);
    expect(isCloseInFlight()).toBe(false);
  });
  it("asks for level 4 when only abandoned URs are requested", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)], { rank: 2 });
    const confirm = accept();
    const notify = silent();

    expect(
      await runCloseSelected(
        sdk,
        { speedCamera: [], mapMate: [], stale: [1] },
        { confirm, notify },
        NOW,
      ),
    ).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0]).toContain("level 4");
    expect(calls).toEqual([]);
  });

  it("drops the abandoned URs at level 3 and still handles the speed cameras", async () => {
    const { sdk, calls } = makeSdk([makeUr(1), makeUr(2, road)], { rank: 2 });
    const confirm = accept();

    await runCloseSelected(
      sdk,
      { speedCamera: [1], mapMate: [], stale: [2] },
      { confirm, notify: silent() },
      NOW,
    );

    expect(specOf(confirm).facts).toHaveLength(1);
    expect(calls).not.toContain("details:2");
  });

  it("describes a mixed batch and messages only the speed cameras", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeUr(2, road)], { rank: 3 });
    const confirm = accept();
    const notify = silent();

    const outcomes = await runCloseSelected(
      sdk,
      { speedCamera: [1], mapMate: [], stale: [2] },
      { confirm, notify },
      NOW,
    );

    expect(specOf(confirm).facts).toHaveLength(2);
    expect(outcomes?.map((o) => o.result)).toEqual(["closed", "closed"]);
    expect(sent.map((s) => s.id)).toEqual([1]);
    expect(notify.mock.calls[0]?.[0]).toContain(
      "The messages are already sent.",
    );
  });

  it("an abandoned-only batch quotes nothing and does not claim messages were sent", async () => {
    const { sdk, sent } = makeSdk([makeUr(1, road)], { rank: 3 });
    const confirm = accept();
    const notify = silent();

    await runCloseSelected(
      sdk,
      { speedCamera: [], mapMate: [], stale: [1] },
      { confirm, notify },
      NOW,
    );

    expect(specOf(confirm).quotes).toBeUndefined();
    expect(specOf(confirm).warning).toBeUndefined();
    expect(sent).toEqual([]);
    const summary = notify.mock.calls[0]?.[0] ?? "";
    expect(summary).toContain("Save to record the closures.");
    expect(summary).not.toContain("already sent");
  });
});

describe("runCloseTrafficLight", () => {
  const segments = [makeSegment(3, 46.5001)];

  it("says the UR is closed without any message, then closes it", async () => {
    const { sdk, calls, sent } = makeSdk([makeTrafficLightUr(1)], {
      segments,
    });
    const confirm = accept();

    const outcome = await runCloseTrafficLight(sdk, 1, {
      confirm,
      notify: silent(),
    });

    expect(outcome).toEqual({ id: 1, result: "closed" });
    const spec = specOf(confirm);
    expect(spec.facts.join(" ")).toContain("No message");
    expect(spec.quotes).toBeUndefined();
    expect(spec.confirmLabel).toBe("Close");
    expect(calls).toEqual(["details:1", "close:1:not-identified"]);
    expect(sent).toEqual([]);
  });

  it("shows the last comment when there is a conversation", async () => {
    const { sdk } = makeSdk([makeTrafficLightUr(1)], {
      segments,
      comments: { 1: [comment] },
    });
    const confirm = accept();

    await runCloseTrafficLight(sdk, 1, { confirm, notify: silent() });

    expect(specOf(confirm).previousComment?.text).toBe("still there");
  });

  it("closes nothing when the editor declines", async () => {
    const { sdk, calls } = makeSdk([makeTrafficLightUr(1)], { segments });

    const outcome = await runCloseTrafficLight(sdk, 1, {
      confirm: decline(),
      notify: silent(),
    });

    expect(outcome).toBeNull();
    expect(calls).toEqual(["details:1"]);
  });

  it("tells the editor when the UR is no longer on a freeway", async () => {
    const { sdk } = makeSdk([makeTrafficLightUr(1)], {
      segments: [makeSegment(4, 46.5001)],
    });
    const notify = silent();

    const outcome = await runCloseTrafficLight(sdk, 1, {
      confirm: accept(),
      notify,
    });

    expect(outcome).toMatchObject({ reason: "skipNotFreeway" });
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe("runCloseStale", () => {
  it("confirms with the age, then closes without a message", async () => {
    const { sdk, sent, calls } = makeSdk([makeUr(1, road)]);
    const confirm = accept();

    const outcome = await runCloseStale(
      sdk,
      1,
      { confirm, notify: silent() },
      NOW,
    );

    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(specOf(confirm).facts).toContain("No activity for 30 days.");
    expect(sent).toEqual([]);
    expect(calls).toEqual(["details:1", "details:1", "close:1:not-identified"]);
  });

  it("counts the days since the last comment, not since the report", async () => {
    const asked = { ...comment, createdOn: NOW - 20 * DAY };
    const { sdk } = makeSdk([makeUr(1, road)], { comments: { 1: [asked] } });
    const confirm = accept();

    await runCloseStale(sdk, 1, { confirm, notify: silent() }, NOW);

    expect(specOf(confirm).facts).toContain("No activity for 20 days.");
  });

  it("writes nothing when the UR is closed while the dialog is open", async () => {
    const ur = makeUr(1, road);
    const { sdk, calls } = makeSdk([ur]);
    const confirm = vi.fn(async () => {
      ur.isOpen = false;
      return true;
    });
    const notify = silent();

    const outcome = await runCloseStale(sdk, 1, { confirm, notify }, NOW);

    expect(outcome).toEqual({ id: 1, result: "skipped", reason: "skipGone" });
    expect(calls).toEqual(["details:1"]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("writes nothing when someone comments while the dialog is open", async () => {
    const comments: Record<number, ConversationElement[]> = {};
    const { sdk, calls } = makeSdk([makeUr(1, road)], { comments });
    const confirm = vi.fn(async () => {
      comments[1] = [{ ...comment, userName: null, createdOn: NOW }];
      return true;
    });

    const outcome = await runCloseStale(
      sdk,
      1,
      { confirm, notify: silent() },
      NOW,
    );

    expect(outcome).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(calls).toEqual(["details:1", "details:1"]);
  });

  it("does nothing when the editor declines", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, road)]);

    expect(
      await runCloseStale(
        sdk,
        1,
        { confirm: decline(), notify: silent() },
        NOW,
      ),
    ).toBeNull();
    expect(calls).toEqual(["details:1"]);
  });
});

describe("runAskMapMate", () => {
  it("shows the exact question, sends it and leaves the UR open", async () => {
    const ur = makeMapMateUr(1, "INCORRECT_SPEED_LIMIT");
    const { sdk, sent } = makeSdk([ur]);
    const confirm = accept();

    const outcome = await runAskMapMate(sdk, 1, { confirm, notify: silent() });

    expect(outcome).toEqual({ id: 1, result: "asked" });
    expect(specOf(confirm).quotes?.[0]?.options[0]?.text).toBe(
      buildMapMateQuestion("speedLimit", "fr"),
    );
    expect(sent.map((s) => s.text)).toEqual([
      buildMapMateQuestion("speedLimit", "fr"),
    ]);
    expect(ur.isOpen).toBe(true);
  });

  it("sends nothing when someone comments while the dialog is open", async () => {
    const comments: Record<number, ConversationElement[]> = {};
    const { sdk, sent } = makeSdk([makeMapMateUr(1, "INCORRECT_TURN")], {
      comments,
    });
    const confirm = vi.fn(async () => {
      comments[1] = [{ ...comment, userName: "reporter" }];
      return true;
    });
    const notify = silent();

    const outcome = await runAskMapMate(sdk, 1, { confirm, notify });

    expect(outcome).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(sent).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("does nothing when the editor declines, or for a UR that is no Map Mate case", async () => {
    const { sdk, calls } = makeSdk([
      makeMapMateUr(1, "INCORRECT_ROUTE"),
      makeUr(2),
    ]);

    expect(
      await runAskMapMate(sdk, 1, { confirm: decline(), notify: silent() }),
    ).toBeNull();
    expect(
      await runAskMapMate(sdk, 2, { confirm: accept(), notify: silent() }),
    ).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("runCloseSelected with Map Mate", () => {
  it("quotes the question and reports it in the summary", async () => {
    const { sdk, sent } = makeSdk([
      makeUr(1),
      makeMapMateUr(2, "INCORRECT_ROUTE"),
    ]);
    const confirm = accept();
    const notify = silent();

    await runCloseSelected(
      sdk,
      { speedCamera: [1], mapMate: [2], stale: [] },
      { confirm, notify },
      NOW,
    );

    expect(specOf(confirm).quotes).toHaveLength(2);
    expect(sent.map((s) => s.id)).toEqual([1, 2]);
    expect(notify.mock.calls[0]?.[0]).toContain("1 question(s) sent.");
  });
});

describe("an abandoned UR with only Map_Team's question (reported from WME)", () => {
  const conversation = [
    {
      createdOn: Date.parse("2026-09-14T05:28:01.420Z"),
      text: "Hallo, was war das Problem bitte? \n Bonjour, quel a été le problème SVP? \n Ciao,",
      userName: "Map_Team",
    },
  ];
  const ur = () =>
    makeUr(1, { ...road, reportedOn: Date.parse("2026-09-13T18:00:00Z") });

  it("is listed as abandoned, then closed when the editor confirms, right now", async () => {
    const now = Date.now();
    const { sdk, calls } = makeSdk([ur()], { comments: { 1: conversation } });
    const scanner = new Scanner(sdk, { now: () => now });
    scanner.setReadStale(true);
    await scanner.rescan();
    expect(scanner.getSnapshot().stale.map((e) => e.state)).toEqual(["stale"]);

    const outcome = await runCloseStale(
      sdk,
      1,
      { confirm: accept(), notify: silent() },
      now,
    );

    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(calls[calls.length - 1]).toBe("close:1:not-identified");
  });
});
