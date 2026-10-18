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
- `src/utils.ts` — shared utilities (haversineDistance, waitForMapIdle)

### Dialogs (`src/ui/`)

`dialog.ts` is the one dialog of the script (`showConfirm`, `showChoice`, `showNotice`);
`showWmeDialog` is gone. Every popup is described as data (`ConfirmSpec`, `ChoiceSpec`,
`NoticeSpec`) built by the feature in its own `confirm-spec.ts` (PT stops:
`src/publicTransportDialogs.ts`), and the host (`DialogHost`) is injectable so the flows are
tested without a DOM. Labels always come from the caller, since each feature has its own
i18next instance. Same containment as before: appended to the page, removed once answered.

"Don't show again" lives in `skipped-confirms.ts`: localStorage key
`wme-ch-helper.skipped-confirms`, a list of ids prefixed by feature. Skippable ids are
`chk.ignoreAll`, `scu.closeOnly`, `scu.closeStale` and `pt.deleteObsolete`. Reset buttons
sit in the checker settings, at the bottom of the URs tab and in the host tab. The house-number
importer is the exception: the box of the single-import confirmation unticks its own
`confirmSingleImport` setting instead, and the bulk-import summary ("N numbers created")
carries a box that unticks `showImportSummary`. A stopped or partial import is always shown.

- A remembered skip never applies when the spec quotes a conversation (`previousComment`),
  and such a confirmation renders no box at all; both rules live in the component, not in
  each caller.
- The URs skip only exists at batch rank, decided in `close.ts` (`skipFor`), so a choice
  remembered at a higher level has no effect below it.

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
- `prompt.ts`: injectable dialog helpers over `ui/dialog.ts` (they take a `ConfirmSpec`), so
  the fix flows stay testable without a DOM.

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
  prompt; the group rename carries the same geometry warning. Confirmations state the
  change, not just how many segments are affected.
- Geometric verdicts and group actions never carry a "don't show again" box; only
  `chk.ignoreAll` does. The flow tests in `fix.test.ts` assert it.
- Nothing is ever saved automatically; corrections go to the WME edit stack.

**Deliberate deviations, do not "fix" them:**

| Deviation | Why |
| --- | --- |
| Own SDK instance and `scriptId` (`index.ts`) | `registerScriptTab()` throws if the host's scriptId already owns a tab |
| Own i18next instance (`i18n.ts`) | The checker's language is a per-feature preference; sharing the host singleton would flip the whole UI. Strings still live in `locales/<lang>/common.json`, under `streetCheck` |
| DOM injection into the segment edit panel (`src/ui/edit-panel-host.ts`) | The SDK exposes no extension point there. **One** container is mounted, and each feature registers a slot with a declared rank; previously each feature prepended its own box on its own retry schedule, so their order depended on which retry won and could flip between selections. A slot that has nothing to say returns `null` and leaves no trace; the host removes itself when every slot does. The containment rule is unchanged, the DOM is only a mount point |
| Floating windows injected into `document.body` (`src/ui/floating-window.ts`, `window-mode.ts`, `detachable-panel.ts`) | WME switches the sidebar to its Selection panel the moment something is clicked on the map, hiding the tab exactly when it is being used. The SDK offers no way to keep a script tab visible, and no window or panel API. The windows only host DOM the tabs already build; scanning, selection and editing still go through SDK events. The street-name checker splits its panel (list in the window, options in the sidebar) and keeps its window in its own settings; the house-number and UR panels move whole through `DetachablePanel`, their state in `wme-ch-helper.windows` (`window-state.ts`). Windows sit below the dialogs (z-index 9000/9001 < 10000), the last one touched on top. Only the checker's toggle has default keys (Alt+W); the others are registered unbound |
| Reordering our own tabs in the Scripts bar (`src/ui/tab-group.ts`) | The SDK's `Sidebar` module exposes only `registerScriptTab()` and `removeScriptTab()`, neither taking arguments: no ordering, grouping, icon or colour. Label and pane are moved together so a pairing by position survives; every failure is silent, and the tabs then simply keep their native place, still prefixed `CH ·` |
| Canton flags as base64 data URIs (`ui/canton-flags.ts`) | Rollup has no SVG asset loader in this setup |
| `GM_xmlhttpRequest` rather than `fetch` (`geoadmin/client.ts`) | WME's CSP blocks `connect-src` to geo.admin.ch |

### House-number importer (`src/house-number-importer/`)

Imports official Swiss house numbers from the federal building register (RegBL/GWR) into
WME. Entry point: `initHouseNumberImporter()` (`index.ts`), called from `main.user.ts`
right after the checker, with its own scriptId for the same reason.

Idea credited to "WME Quick HN Importer CH" by Ari (Reloaded) and Gerhard (GPL-2.0), after
Tom 'Glodenox' Puttemans's concept for Belgium. **No code was taken from it** and none
should be: it drives the DOM where we use the SDK, sends no paging, and hangs every number
on the selected segment. Keep the credit in `index.ts` and in the four READMEs.

Pipeline: `GwrTileFetcher` (gwr/) → `computeStatuses` (status.ts, using `matching.ts` and
the numbers read by `existing.ts`) → `AddressPointLayer` on the map, `TabUI` in the sidebar
and `EditPanelBox` as a slot in the shared segment-panel host. `import.ts` is the only
module that writes.

- `gwr/tiles.ts`: tiles are `0.005°`, four times finer than the checker's. Measured in
  central Zurich, a `0.02°` tile holds 4549 addresses (23 pages, past the cap) against 166
  at `0.005°`. TTL is 7 days; the register moves monthly.
- `existing.ts`: duplicates are looked for on every loaded segment of the same street, not
  only the selected one. WME splits a street at each junction, so number 15 often sits on
  the piece next door.
- `status.ts`: `existingNumbers === null` means "not known yet" and is not the same as
  empty. Matching points stay `NEUTRAL` and the click is inert until `fetchHouseNumbers`
  resolves, otherwise the editor is invited to create a duplicate during the round trip.
- `matching.ts`: compares every register name against every segment name (primary and
  alternates), which is what makes bilingual communes work.

**Safety rules, same spirit as the checker.** Creating a number overwrites nothing and is
undoable, so there is no rank gate here; the guard rails are elsewhere:

- `IMPORT_CAP` (50) lives in `import.ts` and `importPoints` slices to it internally. Three
  surfaces trigger an import; a cap enforced only in the UI would be one missed check away
  from being gone.
- `segmentId` is always passed to `addHouseNumber`. Without it the SDK picks the closest
  segment, which on a corner building is regularly the cross street.
- `MAX_SNAP_DISTANCE_M` (150) rejects a point too far from the selected segment, whatever
  the SDK would have done with it.
- A truncated tile hides the bulk-import button (hidden, not greyed) because "N missing"
  would then be a number the feature cannot vouch for.
- Nothing is ever saved automatically.

Tests: `npx vitest run src/house-number-importer` and
`npx vitest run src/street-name-checker`. The geo.admin.ch integration block is
excluded by default and runs with `WME_CH_INTEGRATION=1`.

### Speed-camera URs (`src/speed-camera-urs/`)

The **CH · UR assistant** tab: it handles four families of open URs, each behind a checkbox.
It started as the speed-camera closer, hence the folder, the i18n section `speedCameraUrs`,
the scriptId and the settings key, all kept on purpose so saved choices and the tab's place
survive. Speed cameras are recognised by the `MISSING_STATIC_SPEED_CAMERA` prefix of their
description; their type is always `INCORRECT_GENERAL_ERROR`, so the type cannot filter
them. Entry point: `initSpeedCameraUrs()` (`index.ts`), called from `main.user.ts` after the
importer, with its own scriptId for the same reason.

Pipeline: `Scanner` (scanner.ts: data-model events and map extent) → `detect.ts` (prefix,
triage) and `stale.ts` (abandoned URs' step) → `TabUI`. `close.ts` is the only module that writes.

- `map-highlight.ts`: the SDK cannot open a UR's panel (`setSelection` does not accept
  update requests), so a click in the list centres, zooms to `FOCUS_ZOOM` and blinks a ring
  around the UR on a layer with `pointerEvents: "none"`; the next click lands on WME's marker.
- `confirm-spec.ts`: confirmations are described as data (`ConfirmSpec`), so the flows are
  tested on what they ask, and rendered by the shared dialog (`src/ui/dialog.ts`, see
  Dialogs). The message is quoted left-aligned with its line breaks; in a batch, one flag
  per language switches the quote to the exact text those reporters get. Flags are inline
  SVG (`src/ui/flags.ts`), not emoji.

- `message.ts`: `userPreferences.language` is the Waze app's language id, not ISO
  (`francais`, `eng`, `portuguese_pt` observed), hence a prefix rule with English fallback.
- Traffic lights reported on a freeway: some reporters disguise a speed camera as a
  `MISSING_TRAFFIC_LIGHT` UR. `isOnFreeway` (detect.ts) keeps one only when the **closest**
  loaded segment within `FREEWAY_MAX_DISTANCE_M` (30) is a FREEWAY; ramps are excluded on
  purpose, real lights stand at their end. The SDK links a UR to no segment, hence the
  geometry, and the scanner tracks `segments` events so a UR drawn before its road still
  appears. These are closed one by one, as not-identified and **without any message**.
- Comment authors, as observed in WME: `"Map_Team"` for the automatic messages, the editor's
  name for an editor, and `null` or `"admin"` for the **reporter**, who has no editor
  account (`"admin"` has no editor profile; seen on UR 27179414, probably depending on how
  the reporter answered). WME does **not** always return the author: the same Map_Team
  comment came back `"Map_Team"` to the scanner and `null` at closure. So a **nameless**
  comment is also recognised as Map_Team by its fixed text (`MAP_TEAM_QUESTIONS`, one line
  per language, detect.ts); a named one never is, since editors paste that question by
  hand. `hasDiscussion` ignores Map_Team only. A nameless comment with any other text is
  the reporter.
- Abandoned URs (`isStaleCandidate` prefilter, `isAbandoned` for the first step, detect.ts): open,
  editable, any type, **no activity for more than `STALE_AGE_DAYS` (14) days** (latest
  comment, or the report when there is none), and the reporter does **not** have the last
  word among the people (`reporterHasLastWord`: Map_Team is left out, its automatic question
  can land after the reporter's reply). The scanner caches what the conversation said and
  decides at each publish, so a UR crossing the 14 days shows up without a reload. A question from Map_Team or an editor left unanswered is exactly what this family
  follows up; a UR whose reporter wrote last is never abandoned, someone owes them an answer.
  Map Mate voice reports (`source === "REPORTING_AGENT"`) never qualify. The scanner reads
  their conversations only when the "Abandoned" box is checked, after the speed cameras' and
  Map Mate's, and caches the conversation itself: the step depends on the time.
- Abandoned URs go through **two steps** (`staleStage`, stale.ts): `remind` (our last
  reminder, `remindStale`, the UR stays open), then `waiting` for `REMINDER_GRACE_DAYS` (3)
  with no button, then `close` (`closeStale`: closing message, then not-identified, comment
  first as for speed cameras). The reminder text says "very soon" and names **no delay** on
  purpose; the 3 days are the script's own count, from the reminder's `createdOn` in the
  conversation, so they survive a reload and another editor's machine. Both texts are
  recognised by their body in any language (`isStaleReminder`, `isStaleClosing`,
  message.ts). Our own text is never the reporter's, even when WME drops its author. The
  reminder counts only while it is the latest comment among the people: an editor writing
  after it starts the 14 days over; the reporter writing after it drops the UR. WME may
  return its cached conversation without our new comment, so `staleSession(id)` (close.ts:
  `reminded` map, `messaged` set) stands in for it, or the UR would be reminded twice.
  A closing message already in the conversation (Ctrl+Z) means close only, never send again;
  such a UR is closed one by one, never in a batch.
- Overlaps: a speed camera is never "abandoned", it always gets the message. A traffic light
  on a freeway is never "abandoned" either, or it would reach a batch through the back door.
- Map Mate reports (`mapMateKind`, detect.ts): `source === "REPORTING_AGENT"`, type
  `INCORRECT_GENERAL_ERROR`, and the code before the first `:` of the description, matched
  exactly through a `Map` (an object literal would answer `constructor`). Six codes, six
  questions (`message.ts`, `askBody*`; `RAILROAD_CROSSING` explains that level crossings
  are mapped only when really dangerous); any other code gets nothing. `askMapMate` only
  comments: the UR **stays open** and the outcome is `"asked"`. A `MISSING_TRAFFIC_LIGHT`
  is asked about only when `isKnownOffFreeway`; on a freeway it belongs to the
  traffic-light family, on an unloaded road it waits.
- Map Mate never gets a question once anyone but Map_Team has commented (`mayAskMapMate`),
  with no override, and never twice: `wasMessaged`, plus `isMapMateQuestion` on the
  conversation, as a second check behind `hasDiscussion`.
- `settings.ts`: the four checkboxes, localStorage key `wme-ch-speed-camera-urs.settings`,
  non-boolean values fall back to the defaults (speed cameras ☑, traffic lights ☑, Map Mate ☐,
  abandoned ☐).
- `addComment` sends **immediately** and cannot be withdrawn, while the closure goes to the
  edit stack. That is why the comment goes first and the closure only follows a successful
  send.

**Safety rules:**

- `BATCH_MIN_RANK` (level 3, speed cameras and Map Mate), `STALE_BATCH_MIN_RANK` (level 4,
  reminders and closures alike) and `BATCH_CAP` (50, the whole batch: speed cameras, then
  Map Mate, then abandoned closures, then reminders) live in
  `close.ts` and are enforced in `closeMany`, not only in the tab. One batch button covers
  what is ticked and allowed; it is hidden when that is empty.
- Any comment keeps a speed camera out of the batch, and any comment but Map_Team's keeps
  a Map Mate report out; abandoned URs follow their own rule (`staleStage`). `wasMessaged` covers Ctrl+Z: the closure
  is undone but the message is not, and WME's cached conversation may not show it yet.
- A UR already messaged is never messaged again: `alreadyMessaged` is true when
  `wasMessaged(id)` (this session) or a comment contains the official text (`isOfficialMessage`,
  any of the four languages), which is what survives a reload when the closure was not saved.
  Closing it one by one closes it without re-sending, behind its own confirmation
  (`confirmCloseOnly`, button "Close"). When the reporter has answered since
  (`reporterLastWord`), that confirmation quotes the reply, so it is shown every time.
- Traffic lights **on a freeway** have **no batch at all**, whatever the level: the prefix
  alone does not make a speed camera. (A Map Mate light known to be off a freeway does reach
  the batch, as a question.) `closeTrafficLight` re-checks the prefix and `isOnFreeway` right
  before writing. `closeMany` cannot reach them: the speed-camera family needs the speed-camera
  prefix, `askMapMate` and `closeStale` refuse a light not known to be off a freeway.
- Messages, freeway traffic lights and any confirmation that quotes a conversation never
  carry a "don't show again" box; the flow tests assert it. The only skippable URs
  confirmations close without sending anything (`scu.closeOnly`, and `scu.closeStale` only
  when the closing message already left). Reminding never carries the box.
- Every UR is re-read right before writing; one closed in the meantime is skipped. The UR's
  state is live, but `getUpdateRequestDetails` may return the conversation already in WME's
  data model (the SDK offers no forced refresh), so a very recent comment can be missing.
- Nothing is ever saved automatically.

Tests: `npx vitest run src/speed-camera-urs`.

## WME SDK Rules

- All WME API interactions use `wme-sdk-typings`. Consult `node_modules/wme-sdk-typings/index.d.ts` and https://www.waze.com/editor/sdk/index.html before implementing features.
- Do not guess or invent SDK APIs — if information is missing from typings or docs, flag it.
- Do not use deprecated WME globals (documented in migration guide's "Pre-SDK usage" section).
- No direct DOM hacks that bypass SDK events. Two sanctioned exceptions, both listed in
  the deviations table above: the shared edit-panel host (`src/ui/edit-panel-host.ts`)
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
