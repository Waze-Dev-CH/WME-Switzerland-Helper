import { describe, expect, it } from "vitest";
import {
  closeAllSpec,
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

describe("closeAllSpec", () => {
  it("counts the messages and the closures", () => {
    const spec = closeAllSpec(["fr", "fr", "de"], "fr");

    expect(spec.title).toBe("Close 3 speed-camera URs");
    expect(spec.facts).toEqual([
      "Messages sent now: 3",
      "URs closed as Not identified: 3",
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
  });

  it("offers every language of the batch, with its count and exact text", () => {
    const spec = closeAllSpec(["de", "fr", "fr", "it"], "en");

    expect(spec.quotes?.options).toEqual([
      { lang: "fr", count: 2, text: buildMessage("fr") },
      { lang: "de", count: 1, text: buildMessage("de") },
      { lang: "it", count: 1, text: buildMessage("it") },
    ]);
    expect(spec.quotes?.hint).toContain("Click a flag");
  });

  it("shows the editor's own language first when the batch has it", () => {
    const spec = closeAllSpec(["fr", "fr", "de"], "de");

    expect(spec.quotes?.options.map((option) => option.lang)).toEqual([
      "de",
      "fr",
    ]);
  });

  it("needs no hint when the batch speaks a single language", () => {
    expect(closeAllSpec(["fr", "fr"], "fr").quotes?.hint).toBeUndefined();
  });
});

describe("excerpt", () => {
  it("keeps a short comment whole and trims a long one to 200 characters", () => {
    expect(excerpt("  still there ")).toBe("still there");
    expect(excerpt("x".repeat(250))).toBe(`${"x".repeat(200)}…`);
  });
});
