import { componentRules, EDIT_PANEL_HOST_CSS } from "../../ui/components";
import { injectStyleOnce } from "../../ui/inject";
import { tokenRules } from "../../ui/tokens";
import { STATUS_STYLES } from "../map-layer";
import type { IssueStatus } from "../matching/evaluate";

/**
 * One background rule per status, so a dot in the panel is the colour the map draws.
 *
 * Exported for its test: the class name is the only link between this file and the
 * `chk-dot-${status}` that tab.ts builds, and a rename on one side alone would silently
 * turn every status dot grey without failing a type check.
 */
export function statusDotRules(): string {
  return (Object.keys(STATUS_STYLES) as IssueStatus[])
    .map((status) => `.chk-dot-${status} { background: ${STATUS_STYLES[status].strokeColor}; }`)
    .join("\n");
}

/**
 * Everything generic — tokens, pane, buttons, switch, banner, pills, sections, busy veil —
 * comes from src/ui now, so this panel and the house-number one are the same panel with two
 * prefixes. componentRules was extracted from this very file; adopting it is what stops the
 * two features drifting apart again.
 *
 * What stays below is what only a list of street-name issues needs: the groups and rows,
 * the floating window, the canton badge, the external links, the edit-panel helper box.
 */
const CSS = `
${tokenRules("chk", [".chk-pane", ".chk-helper", ".chk-window", ".wmech-edit-host"])}
${componentRules("chk")}
${EDIT_PANEL_HOST_CSS}
${statusDotRules()}

.chk-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.chk-unsaved { color: var(--chk-warn); font-weight: bold; font-size: 11px; margin-left: auto; }
.chk-banner-btn { flex-shrink: 0; }

.chk-list { position: relative; display: flex; flex-direction: column; gap: 10px; }
/* Keeps the veil from collapsing onto a one-line list while a rescan runs. */
.chk-list.chk-busy-active { min-height: 90px; }

/* ---- Floating window ---------------------------------------------------- */
/* z-index sits below the shared dialogs' 10000 so the fix confirmations stay on top. */
.chk-window {
  position: fixed;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  min-height: 220px;
  resize: both;
  overflow: hidden;
  background: var(--chk-bg);
  color: var(--chk-text);
  border: 1px solid var(--chk-border);
  border-radius: var(--chk-radius);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
}
.chk-window-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--chk-surface);
  border-bottom: 1px solid var(--chk-border);
  cursor: move;
  user-select: none;
  flex: 0 0 auto;
  touch-action: none;
}
.chk-window-title { flex: 1; font-weight: 600; font-size: 13px; }
.chk-window-btn {
  border: 1px solid var(--chk-border);
  background: var(--chk-bg);
  color: var(--chk-text);
  border-radius: 4px;
  height: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 8px;
  font-size: 12px;
  white-space: nowrap;
}
.chk-window-btn:hover { background: var(--chk-surface); }
/* min-height:0 lets the inner flex column actually shrink instead of overflowing. */
.chk-window-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; }

/* The sidebar's 100vh budget is meaningless in a window the user sizes: let the
   list take the height the window actually has. */
.chk-window .chk-pane { height: 100%; }
.chk-window .chk-groups { max-height: none; flex: 1 1 auto; min-height: 0; }

/* Adaptive window: ~340px accounts for the chrome above/below the list, so the
   list uses the available height without pushing Settings out of reach. */
.chk-groups { display: flex; flex-direction: column; gap: 5px; max-height: clamp(180px, calc(100vh - 340px), 72vh); overflow-y: auto; }
.chk-group { flex-shrink: 0; border: 1px solid var(--chk-border); border-radius: var(--chk-radius); background: var(--chk-surface); }
/* explicit lines (status / name / actions) instead of a flex-wrap free-for-all */
.chk-group-header { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; cursor: pointer; }
.chk-group-header:hover { background: var(--chk-info-bg); }
.chk-group-top { display: flex; align-items: center; gap: 6px; }
.chk-group-top .chk-count { margin-left: auto; }
.chk-group-actions { display: flex; justify-content: flex-end; gap: 6px; }
/* dot + status label, mirroring the pills, so status is not color-only */
.chk-status { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
/* Was 10px muted while it held an enum name and read as a technical code. It now holds the
   label an editor actually reads, so it takes the secondary size like the rest. */
.chk-status-label { font-size: 11px; font-weight: 600; color: var(--chk-text); }
.chk-group-names { overflow-wrap: break-word; }
/* The former Legend entry, now attached to the group it explains. Secondary size and
   muted, so it informs without competing with the street names above it. */
.chk-explain { font-size: 11px; color: var(--chk-muted); line-height: 1.35; }
/* The geometric verdict keeps a visible marker in the group name; warn colour, not the
   text colour, so it reads as a caution rather than as part of the street name. */
.chk-status-warn { color: var(--chk-warn); margin-right: 4px; }
.chk-arrow { color: var(--chk-muted); }
.chk-suggestion { font-weight: bold; color: var(--chk-primary); }
.chk-note { color: var(--chk-muted); font-style: italic; }
.chk-canton-link { display: inline-flex; align-items: center; text-decoration: none; }
.chk-canton-flag { height: 11px; width: auto; vertical-align: middle;
  border: 1px solid rgba(0,0,0,0.2); border-radius: 1px; }
.chk-canton-badge { font-size: 10px; font-weight: 700; color: var(--chk-primary);
  border: 1px solid var(--chk-border); border-radius: 3px; padding: 0 3px; line-height: 1.4; }
.chk-count { color: var(--chk-muted); background: var(--chk-bg); border: 1px solid var(--chk-border); border-radius: 9px; padding: 0 6px; font-size: 10px; }
/* Fix actions = green (positive); Ignore = neutral grey (secondary). */
.chk-fix-all { font-size: 11px; padding: 3px 9px; border: none; border-radius: 6px; background: var(--chk-fix); color: #fff; white-space: nowrap; flex-shrink: 0; }
.chk-fix-all:hover { filter: brightness(1.08); }
.chk-fix-all:disabled { opacity: .6; cursor: default; }
.chk-ignore { font-size: 11px; padding: 3px 9px; border: none; border-radius: 6px; background: var(--chk-ignore); color: #fff; white-space: nowrap; flex-shrink: 0; }
.chk-ignore:hover { filter: brightness(1.08); }
.chk-ignore:disabled { opacity: .6; cursor: default; }

.chk-rows { border-top: 1px solid var(--chk-border); }
/* meta on its own full-width line, controls on the line below */
.chk-row { display: flex; flex-direction: column; gap: 2px; padding: 4px 8px 4px 16px; cursor: pointer; }
.chk-row:hover { background: var(--chk-info-bg); }
.chk-row.chk-selected { background: var(--chk-info-bg); box-shadow: inset 2px 0 0 var(--chk-primary); }
.chk-row-meta { color: var(--chk-muted); width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chk-row-controls { display: flex; align-items: center; gap: 8px; }
/* action buttons stick to the right: whichever comes first takes the auto
   margin; an Ignore right after a Fix stays glued to it */
.chk-row-controls .chk-fix-all, .chk-row-controls .chk-ignore { margin-left: auto; }
.chk-row-controls .chk-fix-all + .chk-ignore { margin-left: 0; }
/* 24px minimum hit areas on the small glyph controls */
.chk-locate { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 24px; font-size: 13px; line-height: 1; padding: 0; background: transparent; border: none; color: var(--chk-text); flex-shrink: 0; }
.chk-locate:hover { color: var(--chk-primary); }
/* both external-viewer links share one bordered box (border moved off the link) */
.chk-row-links { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--chk-border); border-radius: 4px; background: var(--chk-bg); flex-shrink: 0; }
a.chk-geolink { text-decoration: none; color: var(--chk-primary); flex-shrink: 0; }
/* outside the grouped row box (edit-panel head) the link keeps its own border */
.chk-helper a.chk-geolink { border: 1px solid var(--chk-border); border-radius: 4px; padding: 0 5px; background: var(--chk-bg); }

.chk-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; margin: 2px 0; }
.chk-settings-row { display: flex; align-items: center; gap: 8px; }

.chk-empty { color: var(--chk-ok); font-weight: bold; padding: 10px 0; text-align: center; }
.chk-footer { font-size: 11px; border-top: 1px solid var(--chk-border); padding-top: 6px; color: var(--chk-muted); }
.chk-footer a { color: var(--chk-primary); }

.chk-helper { margin: 8px; padding: 8px 10px; border: 1px solid var(--chk-border); border-radius: var(--chk-radius); font-size: 12px; background: var(--chk-surface); color: var(--chk-text); display: flex; flex-direction: column; gap: 6px; }
.chk-helper :is(button, a):focus-visible { outline: 2px solid var(--chk-primary); outline-offset: 1px; }
.chk-helper-head { display: flex; align-items: center; gap: 6px; }
.chk-helper-sug { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.chk-helper button { cursor: pointer; }
`;

export function injectStyles(): void {
  injectStyleOnce("street-name-checker", CSS);
}
