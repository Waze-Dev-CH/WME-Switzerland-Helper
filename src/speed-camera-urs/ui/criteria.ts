import { el } from "../../ui/dom";

/** The WME component, as far as we use it: checked was confirmed to be a boolean property. */
type WzCheckbox = HTMLElement & { checked: boolean };

/** Merely touching customElements can throw in odd frames; outside WME it is absent. */
function wzCheckboxDefined(): boolean {
  try {
    return Boolean(globalThis.customElements?.get("wz-checkbox"));
  } catch {
    return false;
  }
}

/**
 * One family's checkbox. WME's own <wz-checkbox>, so the block looks like the rest of the
 * editor; it is part of WME's interface, not of the SDK, like <wz-button> in
 * src/reloadButton.ts. It only renders, the state lives in our settings.
 *
 * Checked in WME (spec §7): one `change` per click, fired before `click`, with `checked`
 * already holding the new boolean. Where the component is not defined, a plain input inside
 * its label stands in, so a box never looks right while ignoring clicks.
 */
export function criterionCheckbox(
  text: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  if (wzCheckboxDefined()) {
    const box = document.createElement("wz-checkbox") as WzCheckbox;
    box.checked = checked;
    box.textContent = text;
    box.addEventListener("change", () => onChange(box.checked === true));
    return box;
  }
  const label = el("label", "scu-criterion");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, el("span", undefined, text));
  return label;
}
