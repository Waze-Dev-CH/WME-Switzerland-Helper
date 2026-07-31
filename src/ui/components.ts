/**
 * The shared look of a feature panel: switch, buttons, sections, pills, banner.
 *
 * Rules are generated for a given class prefix, so two features look identical without
 * sharing a class name, and without either having to rename anything. They are extracted
 * from the street-name checker's stylesheet, which keeps its own copy: the point is that a
 * new panel starts out matching it, not that the checker be rewritten.
 *
 * Every colour goes through the tokens of `tokens.ts`, so light and dark come for free.
 */
export function componentRules(p: string): string {
  return `
.${p}-pane { font-size: 12px; padding: 8px; display: flex; flex-direction: column; gap: 10px; color: var(--${p}-text); }
.${p}-pane button { cursor: pointer; font-family: inherit; }
.${p}-pane :is(button, a, summary):focus-visible { outline: 2px solid var(--${p}-primary); outline-offset: 1px; }
.${p}-pane label { display: flex; align-items: center; gap: 5px; font-weight: normal; cursor: pointer; }
.${p}-pane select, .${p}-pane input[type="number"] { background: var(--${p}-bg); color: var(--${p}-text); border: 1px solid var(--${p}-border); border-radius: 5px; padding: 2px 5px; font-size: 11px; }
.${p}-muted { color: var(--${p}-muted); }

.${p}-brand { display: flex; align-items: center; gap: 8px; }
.${p}-brand-icon { font-size: 16px; line-height: 1; }
.${p}-brand-title { font-weight: bold; font-size: 14px; color: var(--${p}-text); }

/* Buttons. Neutral is the default; primary carries the one positive action of the panel.
   Hover is a brightness filter rather than a second colour token to maintain. */
.${p}-btn { font-size: 11px; padding: 4px 10px; border: 1px solid var(--${p}-border); border-radius: 6px; background: var(--${p}-surface); color: var(--${p}-text); }
.${p}-btn:hover { border-color: var(--${p}-primary); color: var(--${p}-primary); }
.${p}-btn-primary { border: none; background: var(--${p}-fix); color: #fff; font-weight: 600; padding: 5px 12px; }
.${p}-btn-primary:hover { border: none; filter: brightness(1.08); color: #fff; }
.${p}-btn:disabled { opacity: .6; cursor: default; }

/* WME's design system styles every <button> (fixed height, overflow hidden, uppercase).
   Reset all of it wherever a button stands in for plain text, or labels get clipped. */
.${p}-plain {
  background: none; border: 0; padding: 0; margin: 0;
  font: inherit; line-height: inherit; color: inherit;
  text-align: left; text-transform: none; letter-spacing: normal;
  height: auto; min-height: 0; max-height: none; width: auto;
  overflow: visible; white-space: normal; box-shadow: none; cursor: pointer;
}

/* Status banner: one element, three faces, swapped by class. */
.${p}-banner { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--${p}-radius); background: var(--${p}-info-bg); color: var(--${p}-text); }
.${p}-banner-ok { background: var(--${p}-ok-bg); color: var(--${p}-ok); font-weight: 600; }
.${p}-banner-error { background: rgba(192, 57, 43, .16); color: var(--${p}-error); font-weight: 600; }
.${p}-banner-text { flex: 1; min-width: 0; }
.${p}-warn { font-size: 11px; padding: 5px 10px; border-radius: var(--${p}-radius); background: var(--${p}-warn-bg); color: var(--${p}-warn); }

.${p}-master { display: flex; gap: 18px; flex-wrap: wrap; padding: 8px 10px; background: var(--${p}-surface); border: 1px solid var(--${p}-border); border-radius: var(--${p}-radius); }

/* Switch: the input stays a real checkbox inside the label, so click-on-text, keyboard
   and screen readers work with no ARIA. opacity:0 rather than display:none, which would
   make it unfocusable. The track must be the input's next sibling for the CSS to work. */
.${p}-switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.${p}-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.${p}-switch-track { position: relative; flex: 0 0 auto; width: 34px; height: 20px; border-radius: 10px; background: var(--${p}-border); transition: background .15s; }
.${p}-switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .15s; }
.${p}-switch input:checked + .${p}-switch-track { background: var(--${p}-primary); }
.${p}-switch input:checked + .${p}-switch-track .${p}-switch-knob { transform: translateX(14px); }
.${p}-switch input:focus-visible + .${p}-switch-track { outline: 2px solid var(--${p}-primary); outline-offset: 2px; }
.${p}-switch-label { font-size: 12px; }

/* Pills and dots. A status colour is never carried by the dot alone: it always sits next
   to a label. */
.${p}-pills { display: flex; flex-wrap: wrap; gap: 5px; }
.${p}-pill { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--${p}-border); border-radius: 12px; padding: 2px 9px; background: var(--${p}-surface); color: var(--${p}-text); font-size: 11px; }
.${p}-pill-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.${p}-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* Section = a box; subsection = a mere separator. They nest without a russian-doll look. */
.${p}-section { border: 1px solid var(--${p}-border); border-radius: var(--${p}-radius); background: var(--${p}-surface); overflow: hidden; }
.${p}-section > summary { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-weight: bold; cursor: pointer; list-style: none; color: var(--${p}-text); }
.${p}-section > summary::-webkit-details-marker { display: none; }
.${p}-section > summary::after { content: "▸"; margin-left: auto; color: var(--${p}-muted); transition: transform .15s; }
.${p}-section[open] > summary::after { transform: rotate(90deg); }
.${p}-section[open] > summary { border-bottom: 1px solid var(--${p}-border); }
.${p}-section-icon { font-size: 14px; line-height: 1; }
.${p}-section-body { padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }

.${p}-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.${p}-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
`;
}
