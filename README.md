# WME Switzerland Helper

Welcome! This tool is designed to make editing the Waze Map Editor (WME) easier and more effective for everyone working on maps in Switzerland—no technical background required.

---

## 📚 Documentation in Your Language

Choose your preferred language:

- 🇬🇧 [English](./README.md)
- 🇫🇷 [French](./README.fr.md)
- 🇮🇹 [Italian](./README.it.md)
- 🇩🇪 [German](./README.de.md)

---

## 🚀 What Is This Script?

**WME Switzerland Helper** is a free add-on for the Waze Map Editor. It adds new features and official Swiss map data, making it easier to edit and improve maps in Switzerland.

You don’t need to be a programmer or have any special technical skills to use it!

---

## 🛠️ How to Install and Use

1. **Install Tampermonkey**  
   Tampermonkey is a free browser extension that lets you add helpful scripts to websites.

- [Get Tampermonkey for Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- For other browsers, search for "Tampermonkey" in your browser’s extension/add-on store.

2. **Add the WME Switzerland Helper Script**

- After installing Tampermonkey, click this link:  
  [Install WME Switzerland Helper](https://raw.githubusercontent.com/73VW/WME-Switzerland-Helper/releases/releases/main.user.js)
- Your browser will show a page asking if you want to install the script. Click the <kbd>Install</kbd> button.

3. **Start Editing!**

- Open the [Waze Map Editor](https://www.waze.com/editor?tab=userscript_tab).
- You’ll see new options and a short explanation in the `Scripts` tab.

_That’s it! The script runs automatically when you use the Waze Map Editor._

---

## 🌟 Features

With this script, you get:

- **Official Swiss Map Layers**  
  Add and view extra map layers directly in WME, including:
  - Swiss municipal boundaries (from swisstopo)
  - Swiss cantonal boundaries (from swisstopo)
  - Geographic names (swissNAMES3D)
  - Swiss national color maps
  - High-resolution Swiss aerial imagery
  - Public transport stops

- **Easy Layer Controls**  
  Turn each layer on or off with simple checkboxes in the WME interface.

- **Official Street-Name Check**  
  Compares the street names of the segments you see against the official Swiss street register (swisstopo) and highlights mismatches, with one-click fixes. A dedicated **🇨🇭 Street names** sidebar tab lists the issues, grouped and colour-coded, and the segment edit panel shows the verdict for the selected segment.

All map data comes from official Swiss sources (swisstopo), so you can trust its accuracy.

### How the Public Transport Stops Layer Works

The **Public Transport Stops** layer displays official public transport stops from the Swiss Federal Railways (SBB) database. Here's what you need to know:

- **Visual indicators**: stops that need work appear as **orange bus icons**; WME venues whose stop no longer exists (removed from or expired in the SBB data) appear in **red** and can be deleted
- **Smart matching**: stops already mapped by a venue with the same name within a **75-meter radius** are hidden, so only the ones still needing work are shown
- **Clustering**: at low zoom (12–14) nearby stops are grouped into **clusters**; click a cluster to zoom to its area
- **Reload button**: a bus-icon button in the map's overlay bar refreshes the layer without moving the map, and spins while loading
- **Click to act**:
  - Orange → create a new venue, or merge with / update a nearby one; the stop's city is set automatically from its locality
  - Red → delete the obsolete venue
- **Types supported**: buses, trams, trains, boats, cable cars and funiculars across Switzerland

### How the Street Name Check Works

The **Street Name Check** compares each segment's name with the official Swiss street register and shows what needs attention:

- **Colour-coded statuses**: each issue is highlighted on the map and listed with a colour — from minor typography/spelling differences, through abbreviations and likely typos, to more serious cases such as a valid name that sits on the **wrong street** (flagged ⚠️) or a name **not found** in the register. Each status can be toggled on or off.
- **One-click fixes**: where the official name is known, a **Fix** button applies it (per segment or for a whole group). **Nothing is ever saved automatically** — your edits go into the normal WME edit stack for you to review and save.
- **Geometry aware**: official street axes are matched to segments, so unnamed segments get a suggestion and a name placed on the wrong street is detected.
- **Bilingual streets**: in bilingual communes the official name carries both languages (e.g. "Unterer Quai / Quai du Bas"); the check keeps one language as the primary name and adds the other as an alternate.
- **Ignore false positives**: an **Ignore** button hides a finding you know is fine; it stays hidden (stored locally) and can be reset from the settings.
- **Cantonal geoportal link**: a button opens the segment on the relevant canton's official map, when available.

---

## 💡 Need Help? Have Ideas?

If you have questions, find a bug, or want to suggest a new feature:

1. Go to the [project’s issue tracker](https://github.com/73VW/WME-Switzerland-Helper/issues/new).
2. Click on **"New issue"**.
3. Fill in the title and describe your question, problem, or idea.  
   (Don’t worry if you’re new to GitHub—you may need to create a free account.)
4. Submit your issue. The maintainers will get back to you as soon as possible.

---

Thank you for helping make Waze better for everyone in Switzerland!

---

## 📝 Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### [1.4.0] - 2026-06-16

#### Added

- 🇨🇭 Official street-name check: compares Waze segment names against the Swiss street register (swisstopo / `api3.geo.admin.ch`), with a dedicated **🇨🇭 Street names** sidebar tab and an edit-panel verdict box. Includes colour-coded statuses (typography, abbreviation/variant, likely typo, wrong street ⚠️, wrong city, not found, unnamed, bilingual, Swiss guideline & lock checks), geometry matching, one-click fixes (never auto-saved), bilingual alternate-name handling, an Ignore action for false positives, and a cantonal-geoportal link. Merged from the standalone `WME-CH-Street-Name-Checker` userscript — its detailed 1.0–1.18 history is preserved in [`docs/street-name-checker-changelog.md`](./docs/street-name-checker-changelog.md).
- **Ignore all** button per group, to dismiss a whole group of false positives at once (with a confirmation for large groups)
- Roundabout lock check: roundabouts are now expected to be locked at least **L3**

#### Fixed

- Setting the checker's language no longer changes the language of the rest of the script (e.g. the public-transport dialogs)
- Fewer false **wrong street** reports: a name matching a register entry without a mapped axis (e.g. a named area) is no longer flagged, and a name that is merely a substring of the official label (e.g. "Bach" under "Bachweg") is now handled correctly
- Frequent names ("Route de Berne") no longer falsely report **not found** when the matching axis belongs to a neighbouring commune — the register lookup now pages through every result
- Continuations no longer stay stuck as a false **not found** after pausing the scan and then editing
- Dismissed false positives (Ignore) are kept across settings-format changes instead of being silently reset
- No cantonal-map link is shown for a segment without geometry (it previously pointed outside Switzerland)

#### Changed

- Faster re-checking while editing: cached name lookups and addresses, only changed map highlights are redrawn, and viewport panning is debounced
- Button styling: Fix buttons are green and Ignore buttons a neutral grey, to avoid misclicks; long group-header names wrap instead of breaking character by character

### [1.3.0] - 2026-06-11

#### Added

- 🔴 Obsolete-stop detection: WME transport venues no longer matching an active SBB stop are shown in red and can be deleted
- 🟠 Clustering at zoom 12–14: nearby stops are grouped into clickable clusters that zoom to their area
- 🔄 Overlay reload button (bus icon) that refreshes the layer without moving the map and spins while loading
- 🏙️ Automatic city assignment on venue create/update, derived from the stop's locality (with canton-suffix fallback)
- ⚡ Progressive tiled rendering with a viewport data cache (re-uses fetched data on zoom-in / pan-inside, refetches otherwise)
- ✅ Unit tests (Vitest) for stop-name cleaning, city matching and stop validity

#### Changed

- Venues are fetched directly from the Waze Features API (`venueLevel=4`) in parallel with SBB data, fixing bus/train stations missing below zoom 17; requests are tiled per grid cell to avoid the API's per-request cap
- Rewrote and tested stop-name normalization: strips the locality prefix (exact/abbreviated/truncated), removes trailing transport parentheticals and railway brands (CFF/SBB/FFS), expands common abbreviations (Ptes→Petites, Rte→Route, Bif.→Bifurcation…), and keeps a 2-letter canton suffix
- Stops are filtered by validity: only active stops (`validto` ≥ today) are offered for add/update
- Merge targets a single chosen venue; a same-point venue (≤2.5 m) only offers "merge"; multiple matches prompt a selection
- Lowered the minimum zoom to 12 and the venue edit zoom to 16
- CABLE_RAILWAY stops are named "station de funiculaire"

#### Fixed

- Debounced map move/zoom (700 ms) to avoid redundant fetches
- A failed venue selection (e.g. an off-screen harbor) no longer aborts the click handler
- Clicking a stop below zoom 16 no longer breaks the layer's checkbox

### [1.2.4] - 2026-01-14

#### Changed

- Refactored sidebar to use TypeScript classes for all UI components (SidebarTab, SidebarSection, SidebarItem, Paragraph, TextContent)

### [1.2.3] - 2025-12-12

#### Changed

- Refactored feature layer architecture: removed triple inheritance, `SBBDataLayer` is now a utility class (composition over inheritance)
- Optimized rendering performance: delta-based approach (only draw new/changed features, batch remove obsolete ones)
- Improved filtering efficiency: venues fetched once per render pass instead of per-record SDK calls
- Added `waitForMapIdle()` utility to properly wait for map data after zoom operations
- Fixed zoom-to-17 flow: now waits for venues to be available before re-filtering features

#### Fixed

- Public transport stops no longer show duplicate matches after zooming in from < 17 to 17

### [1.2.2] - 2025-12-11

#### Fixed

- Fixed public transport stops loading all stops on script reload when checkbox was pre-checked. Layer state is now restored after `wme-ready` event to ensure venues data is available before filtering duplicate stops.

### [1.2.1] - 2025-12-10

#### Changed

- 💾 Layer checkbox states persist across reloads
- ⚡ Faster feature-layer rendering; only new/removed features update

### [1.2.0]

#### Added

- 🚏 Public Transport Stops layer with click handling

### [1.1.0]

#### Added

- 🗺️ Added swissNAMES3D overlay

### [1.0.0]

#### Added

- 🎉 Initial release with municipal and cantonal boundaries + national map tiles

---

## Copyright notice

This project is based on the awesome work of Francesco Bedini, who created a template to develop WME userscripts in Typescript. You can find the original project [here](https://github.com/bedo2991/wme-typescript).

His code is licensed under the MIT License, available [here](./LICENSE.original) as of the time this fork was created.

All code related to the Docker devcontainer, VS Code settings, use of locales, and package bundling ("Tools") is also licensed under the MIT License.

All code in `/src/` (and any file with a copyright mentioning Maël Pedretti) is licensed under the [GNU Affero General Public License v3.0 or later (AGPL)](./LICENSE).

**Summary:**

- Use of the original code remains under the MIT License.
- Use of my added code is restricted under AGPL as described in `LICENSE`.

This project is thus **dual-licensed**: portions under MIT (original and tools), portions under AGPL (all `/src/` code and new work by Maël Pedretti).
