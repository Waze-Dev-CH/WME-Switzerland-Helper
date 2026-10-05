import { componentRules } from "../../ui/components";
import { injectStyleOnce } from "../../ui/inject";
import { tokenRules } from "../../ui/tokens";

/** Everything generic comes from src/ui; only the list rows are specific to this tab. */
const CSS = `
${tokenRules("scu", [".scu-pane"])}
${componentRules("scu")}

.scu-list { display: flex; flex-direction: column; gap: 4px; }
.scu-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.scu-row-label { font-variant-numeric: tabular-nums; }
/* The summary carries one problem per line. */
.scu-warn { white-space: pre-line; }
`;

export function injectStyles(): void {
  injectStyleOnce("speed-camera-urs", CSS);
}
