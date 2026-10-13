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
    const label = criterionCheckbox(
      "Speed cameras",
      true,
      onChange,
    ) as unknown as FakeNode;
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
      const box = criterionCheckbox(
        "Speed cameras",
        true,
        onChange,
      ) as unknown as FakeNode;

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
    expect(() => criterionCheckbox("Abandoned", false, () => {})).not.toThrow();
  });
});
