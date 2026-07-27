# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WME Switzerland Helper is a Tampermonkey userscript (TypeScript) that extends the Waze Map Editor with Swiss-specific geographic layers and public transport data. Primary audience: Swiss volunteer map editors.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript (Rollup) + concatenate with header.js → releases/
npm run watch          # Dev mode: concurrent rollup, i18n extraction, prettier, eslint, readme translation
npm run compile        # Rollup only (TypeScript → .out/main.user.js)
npm run lint           # ESLint check
npm run makemessages   # Extract i18next translation keys from source
npm run release        # Bump version in header.js, build, output releases/release-<version>.user.js
```

Build pipeline: `src/*.ts` + `main.user.ts` → Rollup → `.out/main.user.js` → concatenated with `header.js` → `releases/release-<version>.user.js`

## Architecture

**Entry point:** `main.user.ts` — waits for SDK initialization, creates layers, builds sidebar, restores persisted state.

**Layer hierarchy:**

- `Layer` (abstract base in `src/layer.ts`) — checkbox registration, add/remove from map
  - `TileLayer` (`src/tileLayer.ts`) — raster tile layers (boundaries, aerial imagery, etc.)
  - `FeatureLayer` (abstract, `src/featureLayer.ts`) — vector features with click interaction
    - `PublicTransportStopsLayer` (`src/publicTransportStopsLayer.ts`) — fetches SBB data, renders stops

**Data flow for PT stops:** `SBBDataFetcher` → `StopNameFormatter` → `VenueMatcher` (deduplication within 75m) → `StopGeometry` (distance calculations) → render on map

**Supporting modules:**

- `src/sidebar.ts` — UI via `LayoutElement` class hierarchy (TextContent, Paragraph, SidebarItem, SidebarSection, SidebarTab); HTML string templates, no framework
- `src/storage.ts` — layer toggle state persisted in localStorage
- `src/venueMatcher.ts` — fuzzy name + distance-based venue deduplication
- `src/stopGeometry.ts` — haversine/turf geometry for Point/Polygon/MultiPolygon
- `src/utils.ts` — shared utilities (haversineDistance, showWmeDialog, waitForMapIdle)

### Street-name checker (`src/street-name-checker/`)

Roughly half the source. Ported from the standalone `WME-CH-Street-Name-Checker`
userscript, so it does not follow the layer hierarchy above. Entry point:
`initStreetNameChecker()` (`index.ts`), called last from `main.user.ts`.

Pipeline: `TileFetcher` (geoadmin/) → `OfficialIndex` + `SpatialIndex` (matching/) →
`Scanner.evaluateSegment` → `Issue` → `HighlightLayer` on the map and `TabUI` in the
sidebar. `fix.ts` applies corrections into the WME edit stack; nothing is ever saved
automatically.

- `activation.ts`: single entry point for the on/off state. Both the layer checkbox and
  the tab toggle route through it, and `settings.enabled` is the persisted truth.
- `settings.ts`: own store, localStorage key `wme-ch-name-check.settings`, versioned with
  a merging migration so `ignoredKeys` survives an unknown version.
- `geoadmin/idb-store.ts`: IndexedDB tile cache, degrades to a no-op when unavailable.
- `prompt.ts`: injectable dialog helpers over `showWmeDialog`, so the fix flows stay
  testable without a DOM.

**Safety rules for anything that writes to the map.** The script is public, so assume a
first-day editor installed it:

- Rank gates use `rank + 1 = displayed WME level`. `GROUP_FIX_MIN_RANK` (`fix.ts`) and
  `LOCK_DEFAULT_MIN_RANK` (`settings.ts`) are both level 3.
- Group actions are **hidden** below that level, not disabled: a greyed button still
  invites the click. Per-segment fixing stays open to everyone, it is how you learn.
- Any gate enforced in the UI is enforced again in `fix.ts`. Two UIs build these buttons
  and a missed check in either would reopen the hole silently.
- A verdict that comes from geometry rather than name similarity (`WRONG_STREET`)
  confirms every time, whatever the count, and carries its confidence figures into the
  prompt. Confirmations state the change, not just how many segments are affected.
- Nothing is ever saved automatically; corrections go to the WME edit stack.

**Deliberate deviations, do not "fix" them:**

| Deviation | Why |
| --- | --- |
| Own SDK instance and `scriptId` (`index.ts`) | `registerScriptTab()` throws if the host's scriptId already owns a tab |
| Own i18next instance (`i18n.ts`) | The checker's language is a per-feature preference; sharing the host singleton would flip the whole UI. Strings still live in `locales/<lang>/common.json`, under `streetCheck` |
| DOM injection into the segment edit panel (`ui/edit-panel.ts`) | The SDK exposes no extension point there |
| Floating window injected into `document.body` (`ui/floating-window.ts`, `ui/window-mode.ts`) | WME switches the sidebar to its Selection panel the moment a segment is clicked, hiding the tab exactly when it is being used. The SDK offers no way to keep a script tab visible, and no window or panel API. The window only hosts DOM the tab already builds; scanning, selection and editing still go through SDK events |
| Canton flags as base64 data URIs (`ui/canton-flags.ts`) | Rollup has no SVG asset loader in this setup |
| `GM_xmlhttpRequest` rather than `fetch` (`geoadmin/client.ts`) | WME's CSP blocks `connect-src` to geo.admin.ch |

Tests: `npx vitest run src/street-name-checker`. The geo.admin.ch integration block is
excluded by default and runs with `WME_CH_INTEGRATION=1`.

## WME SDK Rules

- All WME API interactions use `wme-sdk-typings`. Consult `node_modules/wme-sdk-typings/index.d.ts` and https://www.waze.com/editor/sdk/index.html before implementing features.
- Do not guess or invent SDK APIs — if information is missing from typings or docs, flag it.
- Do not use deprecated WME globals (documented in migration guide's "Pre-SDK usage" section).
- No direct DOM hacks that bypass SDK events. Two sanctioned exceptions, both listed in
  the deviations table above and both in `src/street-name-checker/ui/`: the edit-panel box
  and the floating window, where the SDK offers no extension point at all. Adding a third
  means documenting it there with its reason, and keeping the same containment: the DOM is
  only a mount point, everything else still goes through SDK events.

## Localization

- Four languages: en, fr, de, it — managed via i18next
- Translation files: `locales/<lang>/common.json`
- Key separator: `.` — namespace separator: `:`
- New strings must be added to **all four** language files
- Run `npm run makemessages` to extract keys from source

## Code Style

- Optimize for cognitive load: readable conditionals with intermediate variables, early returns over nested ifs
- Comments explain "why", not "what"
- Prefer deep modules (simple interface, complex implementation) over shallow wrappers
- Composition over inheritance; avoid excessive abstraction layers
- Minimal TypeScript features — don't require expert-level language knowledge
- A little duplication is better than unnecessary coupling (don't abuse DRY)

## Changelog & Release

- Changelog lives in README files only (README.md, README.fr.md, README.de.md, README.it.md) — no separate CHANGELOG.md
- Follow [Keep a Changelog](https://keepachangelog.com/) format with semantic versioning
- Categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Update **all language versions** when adding entries
- Commit messages: Conventional Commits (`type(scope): subject`)

## Pre-PR Checklist

1. `npm run lint` passes
2. `npm run build` succeeds
3. Manual smoke test in WME: load script, toggle each layer, verify tiles draw
