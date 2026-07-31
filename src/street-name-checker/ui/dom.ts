/**
 * DOM builders with no class state, so the tab and the settings panel can share them.
 * Anything that touches TabUI internals (viewportInputs, the pane, rendering) stays in
 * tab.ts on purpose.
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

export function toggleSwitch(
  text: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  title?: string,
): HTMLElement {
  const label = el("label", "chk-switch");
  if (title) label.title = title;
  const input = el("input") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const track = el("span", "chk-switch-track");
  track.appendChild(el("span", "chk-switch-knob"));
  label.append(input, track, el("span", "chk-switch-label", text));
  return label;
}

export function buildSubsection(icon: string, title: string, children: HTMLElement[]): HTMLElement {
  const details = el("details", "chk-subsection");
  const summary = el("summary");
  summary.append(el("span", "chk-section-icon", icon), el("span", "", title));
  details.appendChild(summary);
  const body = el("div", "chk-subsection-body");
  for (const child of children) body.appendChild(child);
  details.appendChild(body);
  return details;
}
