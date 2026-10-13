import { el, icon } from "../../ui/dom";

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
function checkbox(
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

/**
 * The family's checkbox with an (i) at the end of the line, whose tooltip describes the
 * family. The (i) sits beside the label, not in it, so clicking it never toggles the box.
 * `title` gives the native tooltip; `aria-label` and tabindex make it reachable by keyboard
 * and screen readers. Touch screens get no tooltip; WME is used with a mouse.
 */
export function criterionCheckbox(
  text: string,
  info: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = el("div", "scu-criterion-row");
  const hint = el("span", "scu-info");
  hint.title = info;
  hint.setAttribute("aria-label", info);
  hint.setAttribute("tabindex", "0");
  hint.appendChild(icon("info"));
  row.append(checkbox(text, checked, onChange), hint);
  return row;
}
