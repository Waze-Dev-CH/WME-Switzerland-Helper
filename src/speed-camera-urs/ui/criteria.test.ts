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

  it("does not depend on WME's own components being defined", () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    expect(globals.customElements).toBeUndefined();
    expect(() => criterionCheckbox("Abandoned", false, () => {})).not.toThrow();
  });
});
