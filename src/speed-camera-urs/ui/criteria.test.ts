import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeDocument, type FakeNode } from "../../ui/fake-dom";
import { criterionCheckbox } from "./criteria";

let restore: () => void = () => {};
beforeEach(() => {
  restore = installFakeDocument();
});
afterEach(() => restore());

describe("criterionCheckbox", () => {
  it("is a real checkbox inside its label, reporting each change", () => {
    const onChange = vi.fn();
    const row = criterionCheckbox(
      "Speed cameras",
      "About this family",
      true,
      onChange,
    ) as unknown as FakeNode;
    const label = row.children[0]!;
    const input = label.querySelector("input");

    expect(label.tagName).toBe("label");
    expect(input?.type).toBe("checkbox");
    expect(input?.checked).toBe(true);

    input!.checked = false;
    input!.dispatch("change");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("uses WME's own checkbox when defined, reading the new state on change", () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.customElements = { get: (name: string) => name === "wz-checkbox" };
    try {
      const onChange = vi.fn();
      const row = criterionCheckbox(
        "Speed cameras",
        "About this family",
        true,
        onChange,
      ) as unknown as FakeNode;
      const box = row.children[0]!;

      expect(box.tagName).toBe("wz-checkbox");
      expect(box.checked).toBe(true);
      expect(box.textContent).toBe("Speed cameras");

      // Observed in WME: one change per click, `checked` already holds the new value.
      box.checked = false;
      box.dispatch("change");
      expect(onChange).toHaveBeenLastCalledWith(false);
    } finally {
      delete globals.customElements;
    }
  });

  it("does not depend on WME's own components being defined", () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    expect(globals.customElements).toBeUndefined();
    expect(() =>
      criterionCheckbox("Abandoned", "About this family", false, () => {}),
    ).not.toThrow();
  });

  it("puts the family's description behind an (i), outside the label", () => {
    const onChange = vi.fn();
    const row = criterionCheckbox(
      "Speed cameras",
      "Closes the speed-camera URs.",
      true,
      onChange,
    ) as unknown as FakeNode;
    const info = row.children[1]!;

    expect(row.className).toBe("scu-criterion-row");
    expect(info.className).toBe("scu-info");
    expect(info.title).toBe("Closes the speed-camera URs.");
    expect(info.getAttribute("aria-label")).toBe(
      "Closes the speed-camera URs.",
    );
    expect(info.getAttribute("tabindex")).toBe("0");
    expect(info.querySelector("i")?.className).toContain("w-icon-info");

    info.dispatch("click");
    expect(onChange).not.toHaveBeenCalled();
  });
});
