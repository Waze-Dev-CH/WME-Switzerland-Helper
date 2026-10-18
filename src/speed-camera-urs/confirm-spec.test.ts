import { describe, expect, it } from "vitest";
import {
  askMapMateSpec,
  closeOneSpec,
  closeOnlySpec,
  closeSelectedSpec,
  closeStaleSpec,
  excerpt,
  remindStaleSpec,
} from "./confirm-spec";
import type { MapMateKind } from "./detect";
import type { LocaleCode } from "./i18n";
import {
  buildMapMateQuestion,
  buildMessage,
  buildStaleClosing,
  buildStaleReminder,
} from "./message";

/** The batch's languages; abandoned closures in French, as their count is what matters. */
function selected(
  speedCamera: LocaleCode[],
  mapMate: Array<{ kind: MapMateKind; lang: LocaleCode }>,
  staleCount: number,
) {
  const stale = Array.from({ length: staleCount }, (): LocaleCode => "fr");
  return { speedCamera, mapMate, stale, staleRemind: [] };
}

describe("closeOneSpec", () => {
  it("quotes the exact message in the reporter's language, with the irreversibility warning", () => {
    const spec = closeOneSpec(27011214, "it", null);

    expect(spec.title).toBe("Close UR #27011214");
    expect(spec.quotes?.[0]?.options).toEqual([
      { lang: "it", langLabel: "Italian", text: buildMessage("it") },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send and close");
    expect(spec.previousComment).toBeUndefined();
  });

  it("shows the last comment when the UR already has a conversation", () => {
    const spec = closeOneSpec(1, "fr", "still there");

    expect(spec.previousComment?.text).toBe("still there");
    expect(spec.previousComment?.label).toContain("already has a conversation");
  });
});

describe("closeOnlySpec", () => {
  it("says nothing is sent, quotes nothing and labels the button Close", () => {
    const spec = closeOnlySpec(5);

    expect(spec.facts.join(" ")).toContain("without sending it again");
    expect(spec.quotes).toBeUndefined();
    expect(spec.warning).toBeUndefined();
    expect(spec.confirmLabel).toBe("Close");
  });

  it("carries the skip option only when given one", () => {
    const skip = { label: "Don't show again", isSkipped: false, remember() {} };

    expect(closeOnlySpec(5).skip).toBeUndefined();
    expect(closeOnlySpec(5, skip).skip).toBe(skip);
  });
});

describe("remindStaleSpec", () => {
  it("quotes the reminder, says the UR stays open and gives the idle days", () => {
    const spec = remindStaleSpec(7, "de", 32);

    expect(spec.title).toBe("Remind UR #7");
    expect(spec.facts).toEqual([
      "The message below goes to the reporter now.",
      "The UR stays open for their answer.",
      "No activity for 32 days.",
    ]);
    expect(spec.quotes?.[0]?.options).toEqual([
      { lang: "de", langLabel: "German", text: buildStaleReminder("de") },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send");
    expect(spec.skip).toBeUndefined();
  });
});

describe("closeStaleSpec", () => {
  it("quotes the closing message, with the days since the reminder and the warning", () => {
    const spec = closeStaleSpec(7, "it", 4, false);

    expect(spec.title).toBe("Close UR #7");
    expect(spec.facts).toEqual([
      "The message below goes to the reporter now.",
      "The UR is closed as Not identified.",
      "Reminded 4 days ago, no answer.",
    ]);
    expect(spec.quotes?.[0]?.options).toEqual([
      { lang: "it", langLabel: "Italian", text: buildStaleClosing("it") },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send and close");
  });

  it("never carries the skip option while it sends", () => {
    const skip = { label: "Don't show again", isSkipped: false, remember() {} };

    expect(closeStaleSpec(7, "fr", 4, false, skip).skip).toBeUndefined();
  });

  it("only closes, quoting nothing, when the closing message already left", () => {
    const skip = { label: "Don't show again", isSkipped: false, remember() {} };
    const spec = closeStaleSpec(7, "fr", 4, true, skip);

    expect(spec.facts).toEqual([
      "The UR is closed as Not identified.",
      "The closing message is already in the conversation; it is not sent again.",
    ]);
    expect(spec.quotes).toBeUndefined();
    expect(spec.warning).toBeUndefined();
    expect(spec.confirmLabel).toBe("Close");
    expect(spec.skip).toBe(skip);
  });
});

describe("closeSelectedSpec", () => {
  it("describes each family of a mixed batch, and quotes the message", () => {
    const spec = closeSelectedSpec(selected(["fr", "de"], [], 3), "fr");

    expect(spec.title).toBe("Handle 5 UR(s)");
    expect(spec.facts).toEqual([
      "2 speed camera(s): message sent now, then closed as Not identified",
      "3 abandoned: closing message sent now, then closed as Not identified",
    ]);
    expect(spec.quotes?.[0]?.options.map((option) => option.lang)).toEqual([
      "fr",
      "de",
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send and close");
  });

  it("quotes the closing message and the reminder of the abandoned URs, in their languages", () => {
    const spec = closeSelectedSpec(
      {
        speedCamera: [],
        mapMate: [],
        stale: ["de", "de"],
        staleRemind: ["it", "fr"],
      },
      "fr",
    );

    expect(spec.title).toBe("Handle 4 UR(s)");
    expect(spec.facts).toEqual([
      "2 abandoned: closing message sent now, then closed as Not identified",
      "2 to remind: reminder sent now, the UR stays open",
    ]);
    expect(spec.quotes?.map((block) => block.label)).toEqual([
      "Closing message sent",
      "Reminder sent",
    ]);
    expect(spec.quotes?.[0]?.options).toEqual([
      {
        lang: "de",
        langLabel: "German",
        count: 2,
        text: buildStaleClosing("de"),
      },
    ]);
    expect(spec.quotes?.[1]?.options.map((o) => o.text)).toEqual([
      buildStaleReminder("fr"),
      buildStaleReminder("it"),
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send and close");
  });

  it("labels the button Send when only reminders go", () => {
    const spec = closeSelectedSpec(
      { speedCamera: [], mapMate: [], stale: [], staleRemind: ["fr"] },
      "fr",
    );

    expect(spec.confirmLabel).toBe("Send");
    expect(spec.warning).toContain("cannot be withdrawn");
  });

  it("offers every language of the batch, with its count and exact text", () => {
    const spec = closeSelectedSpec(
      selected(["de", "fr", "fr", "it"], [], 0),
      "en",
    );

    expect(spec.quotes?.[0]?.options).toEqual([
      { lang: "fr", langLabel: "French", count: 2, text: buildMessage("fr") },
      { lang: "de", langLabel: "German", count: 1, text: buildMessage("de") },
      { lang: "it", langLabel: "Italian", count: 1, text: buildMessage("it") },
    ]);
    expect(spec.quotes?.[0]?.hint).toContain("Click a flag");
  });

  it("shows the editor's own language first when the batch has it", () => {
    const spec = closeSelectedSpec(selected(["fr", "fr", "de"], [], 0), "de");

    expect(spec.quotes?.[0]?.options.map((option) => option.lang)).toEqual([
      "de",
      "fr",
    ]);
  });

  it("needs no hint when the batch speaks a single language", () => {
    expect(
      closeSelectedSpec(selected(["fr", "fr"], [], 0), "fr").quotes?.[0]?.hint,
    ).toBeUndefined();
  });
});

describe("excerpt", () => {
  it("keeps a short comment whole and trims a long one to 200 characters", () => {
    expect(excerpt("  still there ")).toBe("still there");
    expect(excerpt("x".repeat(250))).toBe(`${"x".repeat(200)}…`);
  });
});

describe("askMapMateSpec", () => {
  it("names the case, says the UR stays open and quotes the exact question", () => {
    const spec = askMapMateSpec(7, "route", "de");

    expect(spec.title).toBe("Ask for details · UR #7 · Route");
    expect(spec.facts).toEqual([
      "The message below goes to the reporter now.",
      "The UR stays open for their answer.",
    ]);
    expect(spec.quotes?.[0]?.options).toEqual([
      {
        lang: "de",
        langLabel: "German",
        text: buildMapMateQuestion("route", "de"),
      },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send");
    expect(spec.previousComment).toBeUndefined();
  });
});

describe("closeSelectedSpec with Map Mate", () => {
  it("adds a family line and one quote per case, in a fixed order", () => {
    const spec = closeSelectedSpec(
      selected(
        ["fr"],
        [
          { kind: "route", lang: "de" },
          { kind: "trafficLight", lang: "fr" },
          { kind: "route", lang: "fr" },
        ],
        2,
      ),
      "fr",
    );

    expect(spec.title).toBe("Handle 6 UR(s)");
    expect(spec.facts).toEqual([
      "1 speed camera(s): message sent now, then closed as Not identified",
      "3 Map Mate: question sent now, the UR stays open",
      "2 abandoned: closing message sent now, then closed as Not identified",
    ]);
    expect(spec.quotes?.map((block) => block.label)).toEqual([
      "Message sent",
      "Question sent · Traffic light",
      "Question sent · Route",
      "Closing message sent",
    ]);
    expect(spec.quotes?.[2]?.options.map((o) => o.lang)).toEqual(["fr", "de"]);
    expect(spec.warning).toContain("cannot be withdrawn");
  });

  it("says Send and close when questions go with closures", () => {
    const spec = closeSelectedSpec(
      selected([], [{ kind: "turn", lang: "it" }], 3),
      "fr",
    );

    expect(spec.confirmLabel).toBe("Send and close");
  });

  it("labels the button Send when only questions go", () => {
    const spec = closeSelectedSpec(
      selected([], [{ kind: "turn", lang: "it" }], 0),
      "fr",
    );

    expect(spec.confirmLabel).toBe("Send");
    expect(spec.warning).toContain("cannot be withdrawn");
  });
});
