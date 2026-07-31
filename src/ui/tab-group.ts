/**
 * Marking the script's tabs in WME's Scripts bar.
 *
 * The bar mixes the tabs of every installed userscript, and the SDK offers nothing to
 * order, group, colour or icon them: `Sidebar` exposes `registerScriptTab()` and
 * `removeScriptTab()`, both without arguments. The only surface we control is the label's
 * own DOM, so a shared prefix is what tells an editor that three of those tabs belong to
 * the same script.
 */

/**
 * Deliberately NOT translated. Each feature owns its i18next instance and its own language
 * preference, so a translated prefix would render "Suisse · …" next to "Schweiz · …" as soon
 * as someone sets two of them differently, and would stop marking anything at all. "CH" is
 * the country code, reads the same in all four languages, and costs two characters in a bar
 * that already wraps.
 *
 * The Swiss flag emoji is not an option here: Windows ships no glyph for regional
 * indicators, and Chrome on Windows renders it as the bare letters "CH" in a box (see the
 * commit that removed it from the street-name checker).
 */
export const TAB_PREFIX = "CH";

/** The label a Scripts tab of this script should carry. */
export function tabLabelText(title: string): string {
  return `${TAB_PREFIX} · ${title}`;
}

/** Attribute marking the elements this script owns in the Scripts bar. */
const MARKER = "data-wmech-tab";

/** Move `node` right after `reference`, both being children of the same parent. */
function placeAfter(node: Element, reference: Element): void {
  if (node === reference || node.parentElement !== reference.parentElement) return;
  reference.after(node);
}

/**
 * Mark a Scripts tab as ours and pull it next to the ones already marked.
 *
 * DELIBERATE deviation from the CLAUDE.md rule against DOM work outside the SDK, and the
 * third one in this project after the edit-panel box and the floating window. The SDK's
 * Sidebar module exposes only `registerScriptTab()` and `removeScriptTab()`, neither taking
 * any argument: there is no way to order or group tabs through it. Containment is the same
 * as the other two: the DOM is only used to move elements WME itself created, nothing else
 * passes through it, and every failure is silent.
 *
 * Label and pane are moved TOGETHER, keeping the same relative rank in their respective
 * containers. If WME pairs a tab with its panel by position rather than by id, reordering
 * only the labels would open the wrong panel; moving both preserves the pairing for every
 * script, ours and the others'.
 *
 * Incremental on purpose: the three features initialise in parallel with no guaranteed
 * order, so each tab simply joins the ones already there.
 */
export function groupScriptTab(tabLabel: HTMLElement, tabPane: HTMLElement, id: string): void {
  try {
    const labelParent = tabLabel.parentElement;
    const paneParent = tabPane.parentElement;
    if (!labelParent || !paneParent) return;

    // Anchor on the last tab we already placed, read BEFORE marking this one.
    const marked = [...labelParent.querySelectorAll(`[${MARKER}]`)];
    const lastLabel = marked[marked.length - 1] ?? null;

    // The same id on both elements is what lets us find the pane of that last label.
    tabLabel.setAttribute(MARKER, id);
    tabPane.setAttribute(MARKER, id);
    if (!lastLabel) return; // first one in: it defines where the group sits

    const lastId = lastLabel.getAttribute(MARKER);
    const lastPane = lastId ? paneParent.querySelector(`[${MARKER}="${lastId}"]`) : null;

    placeAfter(tabLabel, lastLabel);
    if (lastPane) placeAfter(tabPane, lastPane);
  } catch {
    // A grouping that fails must never cost a tab: WME may have changed the bar's
    // structure, in which case the tabs simply stay where they were, still prefixed.
  }
}
