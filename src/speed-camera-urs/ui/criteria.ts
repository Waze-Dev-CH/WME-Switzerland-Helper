import { el } from "../../ui/dom";

/**
 * One family's checkbox. A plain input inside its label, so clicking the text, tabbing and
 * screen readers work, and the event is the browser's own.
 *
 * Not WME's <wz-checkbox> for now: spec §7 asks to check in WME which event it emits and
 * whether `checked` is a property before depending on it. Until then a box that looks right
 * but ignores clicks is the worse outcome.
 */
export function criterionCheckbox(
  text: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const label = el("label", "scu-criterion");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, el("span", undefined, text));
  return label;
}
