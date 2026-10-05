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
/* The summary carries one problem per line. */
.scu-warn { white-space: pre-line; }

/* Dialog. It carries .scu-pane too, so the tokens and the dark skin apply to it as well. */
.scu-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .4); }
.scu-dialog { width: min(92vw, 520px); max-height: 86vh; overflow: auto; padding: 18px 20px; gap: 12px; background: var(--scu-bg); border: 1px solid var(--scu-border); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, .35); text-align: left; line-height: 1.45; }
.scu-dialog-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--scu-text); }
.scu-dialog-facts { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.scu-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; margin-bottom: -6px; }
.scu-dialog-text { white-space: pre-line; }
/* The message exactly as the reporter will read it: a quotation, left-aligned, breaks kept. */
.scu-quote { margin: 0; padding: 10px 12px; border-left: 3px solid var(--scu-primary); border-radius: 0 6px 6px 0; background: var(--scu-info-bg); color: var(--scu-text); white-space: pre-line; }
.scu-quote-muted { border-left-color: var(--scu-border); background: var(--scu-surface); color: var(--scu-muted); font-style: italic; }
.scu-flags { display: flex; gap: 4px; flex-wrap: wrap; }
.scu-flag { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border: 1px solid var(--scu-border); border-radius: 12px; background: var(--scu-surface); color: var(--scu-text); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
button.scu-flag { cursor: pointer; height: auto; min-height: 0; text-transform: none; letter-spacing: normal; box-shadow: none; }
.scu-flag[aria-pressed="false"] { opacity: .65; }
.scu-flag[aria-pressed="true"] { border-color: var(--scu-primary); background: var(--scu-info-bg); opacity: 1; }
.scu-flag-img { width: 18px; height: 12px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .15); }
.scu-dialog-warning { display: flex; align-items: flex-start; gap: 6px; }
.scu-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
`;

export function injectStyles(): void {
  injectStyleOnce("speed-camera-urs", CSS);
}
