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

## WME SDK Rules

- All WME API interactions use `wme-sdk-typings`. Consult `node_modules/wme-sdk-typings/index.d.ts` and https://www.waze.com/editor/sdk/index.html before implementing features.
- Do not guess or invent SDK APIs — if information is missing from typings or docs, flag it.
- Do not use deprecated WME globals (documented in migration guide's "Pre-SDK usage" section).
- No direct DOM hacks that bypass SDK events.

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
