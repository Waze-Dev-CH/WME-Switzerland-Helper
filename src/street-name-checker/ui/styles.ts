import { STATUS_STYLES } from "../map-layer";
import type { IssueStatus } from "../matching/evaluate";

const statusChipRules = (Object.keys(STATUS_STYLES) as IssueStatus[])
  .map(
    (status) => `
.chk-badge-${status} { background: ${STATUS_STYLES[status].strokeColor}; }`,
  )
  .join("\n");

// Design tokens drive both the sidebar pane and the edit-panel helper box. Each
// token reads a WME design-system variable when present (so it follows the
// editor's light/dark theme) and otherwise uses a light fallback. When WME
// exposes no token, the `html.chk-theme-dark` block swaps those fallbacks for
// dark — that class is toggled at runtime by measuring the WME sidebar's actual
// background luminance (NOT the OS prefers-color-scheme, which can disagree with
// WME's own theme). The exact --wz-color-* names are best-effort: a wrong name
// simply falls back, it never breaks the layout.
const tokens = `
.chk-pane, .chk-helper {
  --chk-bg: var(--wz-color-background, #ffffff);
  --chk-surface: var(--wz-color-background-variant, #f4f6f8);
  --chk-text: var(--wz-color-on-background, #1b1d20);
  --chk-muted: var(--wz-color-on-background-variant, #6b7280);
  --chk-border: var(--wz-color-hairline, #d9dde2);
  --chk-primary: var(--wz-color-primary, #2b5fa4);
  --chk-primary-contrast: var(--wz-color-on-primary, #ffffff);
  --chk-info-bg: rgba(43, 95, 164, .10);
  --chk-ok: #3f8a32;
  --chk-error: #c0392b;
  --chk-radius: 8px;
}
html.chk-theme-dark .chk-pane, html.chk-theme-dark .chk-helper {
  --chk-bg: var(--wz-color-background, #1f2226);
  --chk-surface: var(--wz-color-background-variant, #2a2e33);
  --chk-text: var(--wz-color-on-background, #e6e8eb);
  --chk-muted: var(--wz-color-on-background-variant, #9aa1aa);
  --chk-border: var(--wz-color-hairline, #3a3f45);
  --chk-primary: var(--wz-color-primary, #5b9bd5);
  --chk-info-bg: rgba(91, 155, 213, .16);
  --chk-ok: #6cc05a;
  --chk-error: #e57368;
}`;

export const CSS = `
${tokens}

.chk-pane { font-size: 12px; padding: 8px; display: flex; flex-direction: column; gap: 10px; color: var(--chk-text); }
.chk-pane button { cursor: pointer; font-family: inherit; }
.chk-pane label { display: flex; align-items: center; gap: 5px; font-weight: normal; cursor: pointer; }
.chk-pane select, .chk-pane input[type="number"] { background: var(--chk-bg); color: var(--chk-text); border: 1px solid var(--chk-border); border-radius: 5px; padding: 2px 5px; font-size: 11px; }
.chk-pane input[type="checkbox"] { accent-color: var(--chk-primary); }

.chk-brand { display: flex; align-items: center; gap: 8px; }
.chk-brand-icon { font-size: 16px; line-height: 1; }
.chk-brand-title { font-weight: bold; font-size: 14px; color: var(--chk-text); }
.chk-brand-version { margin-left: auto; font-size: 11px; color: var(--chk-muted); }

.chk-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.chk-btn { font-size: 11px; padding: 4px 10px; border: 1px solid var(--chk-border); border-radius: 6px; background: var(--chk-surface); color: var(--chk-text); }
.chk-btn:hover { border-color: var(--chk-primary); color: var(--chk-primary); }
.chk-unsaved { color: #b35c00; font-weight: bold; font-size: 11px; margin-left: auto; }

.chk-banner { padding: 7px 10px; border-radius: var(--chk-radius); background: var(--chk-info-bg); color: var(--chk-text); }
.chk-banner.chk-banner-ok { background: rgba(63, 138, 50, .16); color: var(--chk-ok); font-weight: 600; }
.chk-banner.chk-error { background: rgba(192, 57, 43, .16); color: var(--chk-error); font-weight: 600; }

.chk-master { display: flex; gap: 18px; flex-wrap: wrap; padding: 8px 10px; background: var(--chk-surface); border: 1px solid var(--chk-border); border-radius: var(--chk-radius); }

.chk-switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.chk-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.chk-switch-track { position: relative; flex: 0 0 auto; width: 34px; height: 20px; border-radius: 10px; background: var(--chk-border); transition: background .15s; }
.chk-switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .15s; }
.chk-switch input:checked + .chk-switch-track { background: var(--chk-primary); }
.chk-switch input:checked + .chk-switch-track .chk-switch-knob { transform: translateX(14px); }
.chk-switch input:focus-visible + .chk-switch-track { outline: 2px solid var(--chk-primary); outline-offset: 2px; }
.chk-switch-label { font-size: 12px; }

.chk-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chk-chip { display: inline-flex; align-items: center; border: 1px solid var(--chk-border); border-radius: 12px; padding: 2px 9px; background: var(--chk-surface); color: var(--chk-text); font-size: 11px; }
.chk-chip:hover { border-color: var(--chk-primary); }
.chk-chip.chk-chip-active { border-color: var(--chk-primary); background: var(--chk-info-bg); color: var(--chk-primary); font-weight: 600; }
.chk-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; flex-shrink: 0; }

.chk-list { position: relative; display: flex; flex-direction: column; gap: 10px; }
.chk-list.chk-busy-active { min-height: 90px; }
.chk-busy { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 5; border-radius: var(--chk-radius); background: color-mix(in srgb, var(--chk-bg) 55%, transparent); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
.chk-list.chk-busy-active .chk-busy { display: flex; }
.chk-spinner { width: 26px; height: 26px; border: 3px solid var(--chk-border); border-top-color: var(--chk-primary); border-radius: 50%; animation: chk-spin .8s linear infinite; }
.chk-busy-text { font-size: 12px; font-weight: 600; color: var(--chk-text); }
@keyframes chk-spin { to { transform: rotate(360deg); } }

.chk-groups { display: flex; flex-direction: column; gap: 5px; max-height: 48vh; overflow-y: auto; }
.chk-group { flex-shrink: 0; border: 1px solid var(--chk-border); border-radius: var(--chk-radius); background: var(--chk-surface); }
.chk-group-header { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 5px 8px; cursor: pointer; }
.chk-group-header:hover { background: var(--chk-info-bg); }
.chk-badge { display: inline-block; min-width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
${statusChipRules}
/* flex: 1 with no min-width:0 so the name never shrinks below its longest word
   (no char-by-char break); the header wraps the count/buttons to the next line instead. */
.chk-group-names { flex: 1 1 60%; overflow-wrap: break-word; }
.chk-arrow { color: var(--chk-muted); }
.chk-suggestion { font-weight: bold; color: var(--chk-primary); }
.chk-note { color: var(--chk-muted); font-style: italic; }
.chk-canton-link { display: inline-flex; align-items: center; text-decoration: none; }
.chk-canton-flag { height: 11px; width: auto; vertical-align: middle;
  border: 1px solid rgba(0,0,0,0.2); border-radius: 1px; }
.chk-canton-badge { font-size: 10px; font-weight: 700; color: var(--chk-primary);
  border: 1px solid var(--chk-border); border-radius: 3px; padding: 0 3px; line-height: 1.4; }
.chk-count { color: var(--chk-muted); background: var(--chk-bg); border: 1px solid var(--chk-border); border-radius: 9px; padding: 0 6px; font-size: 10px; }
.chk-fix-all { font-size: 11px; padding: 3px 9px; border: none; border-radius: 6px; background: var(--chk-primary); color: var(--chk-primary-contrast); white-space: nowrap; flex-shrink: 0; }
.chk-fix-all:hover { filter: brightness(1.08); }
.chk-fix-all:disabled { opacity: .6; cursor: default; }
.chk-ignore { font-size: 11px; padding: 3px 9px; border: none; border-radius: 6px; background: #e67e22; color: #fff; white-space: nowrap; flex-shrink: 0; }
.chk-ignore:hover { filter: brightness(1.08); }
.chk-ignore:disabled { opacity: .6; cursor: default; }

.chk-rows { border-top: 1px solid var(--chk-border); }
.chk-row { display: flex; align-items: center; gap: 6px; padding: 3px 8px 3px 16px; cursor: pointer; }
.chk-row:hover { background: var(--chk-info-bg); }
.chk-row.chk-selected { background: var(--chk-info-bg); box-shadow: inset 2px 0 0 var(--chk-primary); }
.chk-row-meta { color: var(--chk-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chk-locate { font-size: 13px; line-height: 1; padding: 0 5px; background: transparent; border: none; color: var(--chk-text); flex-shrink: 0; }
.chk-locate:hover { color: var(--chk-primary); }
a.chk-geolink { text-decoration: none; border: 1px solid var(--chk-border); border-radius: 4px; padding: 0 5px; color: var(--chk-primary); background: var(--chk-bg); flex-shrink: 0; }

.chk-section { border: 1px solid var(--chk-border); border-radius: var(--chk-radius); background: var(--chk-surface); overflow: hidden; }
.chk-section > summary { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-weight: bold; cursor: pointer; list-style: none; color: var(--chk-text); }
.chk-section > summary::-webkit-details-marker { display: none; }
.chk-section > summary::after { content: "▸"; margin-left: auto; color: var(--chk-muted); transition: transform .15s; }
.chk-section[open] > summary::after { transform: rotate(90deg); }
.chk-section[open] > summary { border-bottom: 1px solid var(--chk-border); }
.chk-section-icon { font-size: 14px; line-height: 1; }
.chk-section-body { padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }

.chk-subsection { border-top: 1px solid var(--chk-border); }
.chk-subsection:first-child { border-top: none; }
.chk-subsection > summary { display: flex; align-items: center; gap: 6px; padding: 6px 0; font-weight: 600; cursor: pointer; list-style: none; color: var(--chk-text); }
.chk-subsection > summary::-webkit-details-marker { display: none; }
.chk-subsection > summary::after { content: "▸"; margin-left: auto; color: var(--chk-muted); transition: transform .15s; }
.chk-subsection[open] > summary::after { transform: rotate(90deg); }
.chk-subsection-body { padding: 4px 0 8px; display: flex; flex-direction: column; gap: 6px; }

.chk-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; margin: 2px 0; }
.chk-settings-row { display: flex; align-items: center; gap: 8px; }
.chk-settings-label { font-weight: 600; }

.chk-empty { color: var(--chk-ok); font-weight: bold; padding: 10px 0; text-align: center; }
.chk-muted { color: var(--chk-muted); }
.chk-error { color: var(--chk-error); }
.chk-footer { font-size: 11px; border-top: 1px solid var(--chk-border); padding-top: 6px; color: var(--chk-muted); }
.chk-footer a { color: var(--chk-primary); }

.chk-helper { margin: 8px; padding: 8px 10px; border: 1px solid var(--chk-border); border-radius: var(--chk-radius); font-size: 12px; background: var(--chk-surface); color: var(--chk-text); display: flex; flex-direction: column; gap: 6px; }
.chk-helper-head { display: flex; align-items: center; gap: 6px; }
.chk-helper-sug { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.chk-helper button { cursor: pointer; }
`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  injected = true;
}
