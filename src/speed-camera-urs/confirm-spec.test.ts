import { describe, expect, it } from "vitest";
import {
  closeSelectedSpec,
  closeStaleSpec,
  closeOneSpec,
  closeOnlySpec,
  excerpt,
} from "./confirm-spec";
import { buildMessage } from "./message";

describe("closeOneSpec", () => {
  it("quotes the exact message in the reporter's language, with the irreversibility warning", () => {
    const spec = closeOneSpec(27011214, "it", null);

    expect(spec.title).toBe("Close UR #27011214");
    expect(spec.quotes?.options).toEqual([
      { lang: "it", text: buildMessage("it") },
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
});

describe("closeStaleSpec", () => {
  it("states the closure, that nothing is sent and the age; no quote, no warning", () => {
    const spec = closeStaleSpec(7, 32);

    expect(spec.title).toBe("Close UR #7");
    expect(spec.facts).toEqual([
      "The UR is closed as Not identified.",
      "No message is sent to the reporter.",
      "Reported 32 days ago.",
    ]);
    expect(spec.quotes).toBeUndefined();
    expect(spec.warning).toBeUndefined();
    expect(spec.confirmLabel).toBe("Close");
  });
});

describe("closeSelectedSpec", () => {
  it("describes each family of a mixed batch, and quotes the message", () => {
    const spec = closeSelectedSpec(["fr", "de"], 3, "fr");

    expect(spec.title).toBe("Close 5 UR(s)");
    expect(spec.facts).toEqual([
      "2 speed camera(s): message sent now, then closed as Not identified",
      "3 abandoned: closed as Not identified, without any message",
    ]);
    expect(spec.quotes?.options.map((option) => option.lang)).toEqual([
      "fr",
      "de",
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send and close");
  });

  it("quotes nothing and warns of nothing when only abandoned URs go", () => {
    const spec = closeSelectedSpec([], 4, "fr");

    expect(spec.facts).toEqual([
      "4 abandoned: closed as Not identified, without any message",
    ]);
    expect(spec.quotes).toBeUndefined();
    expect(spec.warning).toBeUndefined();
    expect(spec.confirmLabel).toBe("Close");
  });

  it("offers every language of the batch, with its count and exact text", () => {
    const spec = closeSelectedSpec(["de", "fr", "fr", "it"], 0, "en");

    expect(spec.quotes?.options).toEqual([
      { lang: "fr", count: 2, text: buildMessage("fr") },
      { lang: "de", count: 1, text: buildMessage("de") },
      { lang: "it", count: 1, text: buildMessage("it") },
    ]);
    expect(spec.quotes?.hint).toContain("Click a flag");
  });

  it("shows the editor's own language first when the batch has it", () => {
    const spec = closeSelectedSpec(["fr", "fr", "de"], 0, "de");

    expect(spec.quotes?.options.map((option) => option.lang)).toEqual([
      "de",
      "fr",
    ]);
  });

  it("needs no hint when the batch speaks a single language", () => {
    expect(
      closeSelectedSpec(["fr", "fr"], 0, "fr").quotes?.hint,
    ).toBeUndefined();
  });
});

describe("excerpt", () => {
  it("keeps a short comment whole and trims a long one to 200 characters", () => {
    expect(excerpt("  still there ")).toBe("still there");
    expect(excerpt("x".repeat(250))).toBe(`${"x".repeat(200)}…`);
  });
});
