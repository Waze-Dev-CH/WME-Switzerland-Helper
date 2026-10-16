import { componentRules } from "../../ui/components";
import { injectStyleOnce } from "../../ui/inject";
import { tokenRules } from "../../ui/tokens";

/** Everything generic comes from src/ui; only the list rows and the dialog are specific here. */
const CSS = `
${tokenRules("scu", [".scu-pane"])}
${componentRules("scu")}

.scu-list { display: flex; flex-direction: column; gap: 4px; }
.scu-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.scu-row-label { font-variant-numeric: tabular-nums; }
.scu-criteria { display: flex; flex-direction: column; gap: 4px; }
.scu-criteria-label { font-weight: 600; }
.scu-criterion { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.scu-criterion-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.scu-info { display: inline-flex; color: var(--scu-muted); cursor: help; }
/* The summary carries one problem per line. */
.scu-warn { white-space: pre-line; }

`;

export function injectStyles(): void {
  injectStyleOnce("speed-camera-urs", CSS);
}
