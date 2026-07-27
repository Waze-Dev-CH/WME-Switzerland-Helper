import { componentRules } from "../../ui/components";
import { injectStyleOnce } from "../../ui/inject";
import { tokenRules } from "../../ui/tokens";
import { STATUS_STYLES } from "../map-layer";
import type { PointStatus } from "../status";

/**
 * Status colours are derived from the map styles, so a pill in the tab can never drift
 * from the circle it stands for on the map.
 */
const statusDotRules = (Object.keys(STATUS_STYLES) as PointStatus[])
  .map(
    (status) =>
      `.hn-dot-${status} { background: ${STATUS_STYLES[status].fillColor}; opacity: ${Math.max(0.55, STATUS_STYLES[status].fillOpacity)}; }`,
  )
  .join("\n");

/**
 * Everything generic (tokens, switch, buttons, sections, banner) comes from src/ui, so
 * this panel matches the street-name checker's. Only what is specific to house numbers
 * lives here.
 */
const CSS = `
${tokenRules("hn", [".hn-pane"])}
${componentRules("hn")}

.hn-street { font-weight: 600; font-size: 13px; }
.hn-verdict { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; }
.hn-verdict-ok { color: var(--hn-ok); }
.hn-verdict-mismatch { color: var(--hn-warn); }
.hn-selection { display: flex; flex-direction: column; gap: 6px; }
.hn-legend { display: flex; flex-direction: column; gap: 5px; }
.hn-legend-row { display: flex; align-items: center; gap: 8px; }
.hn-note { font-size: 11px; color: var(--hn-muted); }
${statusDotRules}
`;

export function injectStyles(): void {
  injectStyleOnce("house-number-importer", CSS);
}
