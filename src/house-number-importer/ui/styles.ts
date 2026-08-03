import { componentRules } from "../../ui/components";
import { injectStyleOnce } from "../../ui/inject";
import { tokenRules } from "../../ui/tokens";

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
/* Overrides the generic 8px dot: these carry a pictogram, which needs the room. */
.hn-dot { width: 13px; height: 13px; }
`;

export function injectStyles(): void {
  injectStyleOnce("house-number-importer", CSS);
}
