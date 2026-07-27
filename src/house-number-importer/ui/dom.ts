/**
 * DOM builders with no class state, so the tab and the edit-panel box can share them.
 * The markup matches what `componentRules("hn")` styles; in particular the switch keeps a
 * real checkbox as the track's previous sibling, which is what the CSS hangs on.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The input stays a real checkbox inside the label, so clicking the text, tabbing to it
 * and screen readers all work without a single ARIA attribute.
 */
export function toggleSwitch(
  text: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  title?: string,
): HTMLElement {
  const label = el("label", "hn-switch");
  if (title) label.title = title;
  const input = el("input") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const track = el("span", "hn-switch-track");
  track.appendChild(el("span", "hn-switch-knob"));
  label.append(input, track, el("span", "hn-switch-label", text));
  return label;
}

export function button(
  text: string,
  onClick: () => void,
  className = "hn-btn",
): HTMLButtonElement {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export function numberInput(
  value: number,
  onChange: (value: number) => void,
  bounds: { min: number; max: number },
): HTMLInputElement {
  const input = el("input") as HTMLInputElement;
  input.type = "number";
  input.min = String(bounds.min);
  input.max = String(bounds.max);
  input.value = String(value);
  input.style.width = "60px";
  input.addEventListener("change", () => {
    const parsed = Number.parseInt(input.value, 10);
    const clamped = Math.min(bounds.max, Math.max(bounds.min, parsed));
    // Reflect the clamp back, so the field never shows a value the feature ignores.
    input.value = String(Number.isFinite(clamped) ? clamped : value);
    onChange(Number(input.value));
  });
  return input;
}

/** A coloured dot standing next to a label; never the sole carrier of a meaning. */
export function dot(status: string): HTMLElement {
  return el("span", `hn-dot hn-dot-${status}`);
}

/**
 * A collapsible box. `open` decides the initial state only: the element is built once and
 * kept, so the editor's own expand/collapse survives every re-render.
 */
export function buildSection(
  icon: string,
  title: string,
  children: HTMLElement[],
  open = false,
): HTMLDetailsElement {
  const details = el("details", "hn-section");
  details.open = open;
  const summary = el("summary");
  summary.append(el("span", "hn-section-icon", icon), el("span", "", title));
  details.appendChild(summary);
  const body = el("div", "hn-section-body");
  for (const child of children) body.appendChild(child);
  details.appendChild(body);
  return details;
}
