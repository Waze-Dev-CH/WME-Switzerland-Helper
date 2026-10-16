# Popups harmonisés Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every popup of the script uses the speed-camera-URs dialog (look and structure), and simple reversible confirmations get a "Don't show again" box.

**Architecture:** The URs dialog moves to `src/ui/dialog.ts` as the one dialog of the script, described by data (`ConfirmSpec`, `ChoiceSpec`, `NoticeSpec`). A small shared store remembers skipped confirmations per feature prefix. Each feature builds its specs in its own `confirm-spec.ts` with its own i18next instance; `showWmeDialog` is deleted.

**Tech Stack:** TypeScript, Vitest (Node, `src/ui/fake-dom.ts`, no jsdom), i18next, WME SDK.

**Spec:** `docs/superpowers/specs/2026-10-16-unified-dialogs-design.md`

## Global Constraints

- Labels (buttons, checkbox, titles) always come from the caller, never from `src/ui/dialog.ts`: each feature has its own i18next instance and language preference.
- Store key: `wme-ch-helper.skipped-confirms`, JSON array of ids `chk.<name>`, `scu.<name>`, `pt.<name>`. Unreadable value or missing storage = empty list, every popup shown.
- Skippable ids, and no others: `chk.ignoreAll`, `scu.closeOnly` (rank ≥ `BATCH_MIN_RANK`), `scu.closeStale` (rank ≥ `STALE_BATCH_MIN_RANK`), `pt.deleteObsolete`. The single house-number import unticks the existing `confirmSingleImport` setting instead of using the store.
- A remembered skip is ignored when the spec has `previousComment`.
- Cancel first and focused, Escape and backdrop click cancel, `z-index: 10000` kept.
- No raw HTML in any popup (`allowHtml` disappears with `showWmeDialog`).
- New strings in all four `locales/<lang>/common.json`. `i18next-parser` runs with `keepRemoved: true`: delete the replaced keys by hand.
- No em dashes in any copy. Commits: Conventional Commits, **no Claude reference, no Co-Authored-By line**.
- Verify loop before each commit: `npx tsc --noEmit` · `npm test` · `npx eslint src` · `npx rollup -c`.

## Review Focus

1. **WME dark skin, PT popup with every feature tab disabled.** The dialog reads its colours from `html.wmech-theme-dark`; check who calls `watchTheme` when only the host tab is active. Expected: readable in both skins. Pinned in Task 1 (test that `injectDialogStyles` emits the dark rules) and in the Task 7 smoke test.
2. **Escape in a popup also reaching WME's shortcuts.** The old helper stopped it in the capture phase on `document`; the URs dialog only listened on the backdrop. Expected: Escape closes the popup and nothing else. Pinned in Task 1.
3. **`localStorage` throwing (private window, blocked site data).** Expected: every popup shown, nothing thrown. Pinned in Task 2.
4. **Skip remembered, then rank too low** (shared account, level lowered). Expected: popup shown, no box. Pinned in Task 3.
5. **Skip remembered but the situation changed** (a reporter reply after the box was ticked). Expected: the re-read before writing still refuses. Pinned in Task 3.

---

### Task 1: Shared dialog component

**Files:**
- Create: `src/ui/dialog.ts` (from `src/speed-camera-urs/ui/dialog.ts`, then deleted)
- Create: `src/ui/flags.ts` (moved from `src/speed-camera-urs/ui/flags.ts`)
- Create: `src/ui/dialog.test.ts` (from `src/speed-camera-urs/ui/dialog.test.ts`, then deleted)
- Modify: `src/speed-camera-urs/ui/styles.ts:21-38` (dialog rules move out), `src/speed-camera-urs/confirm-spec.ts` (types move out), `src/speed-camera-urs/prompt.ts` (imports)

**Interfaces:**
- Produces (in `src/ui/flags.ts`): `type FlagLang = "fr" | "de" | "it" | "en"`, `FLAG_SRC: Record<FlagLang, string>`.
- Produces (in `src/ui/dialog.ts`):

```ts
export interface DialogHost { mount(node: HTMLElement): void; unmount(node: HTMLElement): void }
export interface QuoteOption { lang: FlagLang; langLabel: string; count?: number; text: string }
export interface QuoteBlock { label: string; hint?: string; options: QuoteOption[] }
export interface SkipOption { label: string; isSkipped: boolean; remember(): void }
export interface ConfirmSpec {
  title: string;
  facts: string[];
  note?: string;                                   // muted line under the facts
  previousComment?: { label: string; text: string };
  quotes?: QuoteBlock[];
  warning?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;                                // red confirm button
  skip?: SkipOption;
}
export interface Choice<T extends string> { value: T; label: string; description?: string }
export interface ChoiceSpec<T extends string> { title: string; facts: string[]; choices: Choice<T>[]; cancelLabel: string }
export interface NoticeSpec { title: string; text: string; okLabel: string }
export function showConfirm(spec: ConfirmSpec, host?: DialogHost): Promise<boolean>;
export function showChoice<T extends string>(spec: ChoiceSpec<T>, host?: DialogHost): Promise<T | null>;
export function showNotice(spec: NoticeSpec, host?: DialogHost): Promise<void>;
export function injectDialogStyles(): void;
```

`langLabel` replaces the lookup `t(LANGUAGE_NAME[lang])` the URs dialog did itself: the component must not reach a feature's i18n. CSS prefix `dlg` (`tokenRules("dlg", [".dlg-pane"])`, `componentRules("dlg")`, `injectStyleOnce("dialog", …)`), class names as in the URs dialog with `scu-` → `dlg-`, plus `dlg-btn-danger` (background `var(--dlg-error)`, white, 600), `dlg-skip` (label left of the actions, `margin-right: auto`, 11px, muted), `dlg-choices` / `dlg-choice` (column of full-width buttons, bold label, 11px muted description, hover border primary). Visual reference: `.superpowers/brainstorm/*/content/dialogues-v1.html`.

- [ ] **Step 1: Move the existing tests to `src/ui/dialog.test.ts`**, rewritten against hand-built specs (no import from `speed-camera-urs`), class names `dlg-*`, `vi.mock("./inject", …)` instead of `./styles`. Keep every existing case.

- [ ] **Step 2: Add the failing tests**

```ts
it("resolves true without mounting anything when the skip is remembered", async () => {
  const { host, mounted } = makeHost();
  const remember = vi.fn();
  expect(await showConfirm(spec({ skip: { label: "Ne plus montrer", isSkipped: true, remember } }), host)).toBe(true);
  expect(mounted).toHaveLength(0);
});
it("shows the dialog when the skip is remembered but a conversation is quoted", () => {
  const { host, mounted } = makeHost();
  void showConfirm(spec({ previousComment: { label: "Conversation", text: "still there" },
                          skip: { label: "x", isSkipped: true, remember: vi.fn() } }), host);
  expect(mounted).toHaveLength(1);
});
it("remembers when the box is ticked and the action confirmed", …);       // remember called once, answer true
it("remembers nothing when the box is ticked and the dialog cancelled", …); // remember not called
it("renders no box when the spec has no skip", …);                         // findAll(root, "dlg-skip") empty
it("uses the danger button when the spec says so", …);                     // dlg-btn-danger present, dlg-btn-primary absent
it("stops Escape from reaching the page", …);                              // the keydown event's stopPropagation called, resolves false
it("showChoice resolves the clicked value, null on cancel", …);
it("showNotice renders its title and resolves on OK", …);
it("injectDialogStyles emits the dark-skin rules", …);                     // CSS passed to injectStyleOnce contains "html.wmech-theme-dark .dlg-pane"
```

`FakeNode.dispatch` fires handlers without an event object; extend `src/ui/fake-dom.ts` so `dispatch(type, event?)` passes an optional event through, and use `{ key: "Escape", stopPropagation: vi.fn() }`.

- [ ] **Step 3: Run** `npx vitest run src/ui/dialog.test.ts`: Expected: FAIL (module/functions missing).

- [ ] **Step 4: Implement `src/ui/dialog.ts` and `src/ui/flags.ts`.** Skip check first in `showConfirm`: `if (spec.skip?.isSkipped && !spec.previousComment) return Promise.resolve(true)`. The box is a real `<input type="checkbox">` inside a `<label>` (pattern of `src/ui/dom.ts`), unticked on every opening; `remember()` is called only from the confirm button. Escape handler calls `event.stopPropagation()`.

- [ ] **Step 5: Point the URs feature at it.** `confirm-spec.ts` imports the types from `../ui/dialog` (re-export nothing), fills `langLabel` with `t("langFr" | …)` in `languageQuote` and the single-language quotes; `prompt.ts` imports `showConfirm`/`showNotice` from `../ui/dialog`; delete `speed-camera-urs/ui/dialog.ts`, `ui/dialog.test.ts`, `ui/flags.ts`, and the dialog rules in `ui/styles.ts`. Until Task 3, `notifyDialog` wraps the message as `{ title: t("appName"), text, okLabel: t("dialogOk") }`.

- [ ] **Step 6: Run** `npx vitest run src/ui src/speed-camera-urs`: Expected: PASS. Then the verify loop.

- [ ] **Step 7: Commit**: `refactor(ui): move the URs dialog to src/ui as the shared dialog`

---

### Task 2: "Don't show again" store

**Files:**
- Create: `src/ui/skipped-confirms.ts`, `src/ui/skipped-confirms.test.ts`

**Interfaces:**
- Consumes: `SkipOption` (Task 1).
- Produces:

```ts
export type SkipScope = "chk" | "scu" | "pt";
export function isConfirmSkipped(id: string): boolean;
export function rememberSkip(id: string): void;
export function hasSkipped(scope: SkipScope): boolean;
export function clearSkipped(scope: SkipScope): void;
/** id is "<scope>.<name>"; isSkipped is read now, remember writes later. */
export function skipOption(id: string, label: string): SkipOption;
```

- [ ] **Step 1: Write the failing tests** (stub `localStorage` with `vi.stubGlobal`, as `street-name-checker/settings.test.ts:102` does):
  - `rememberSkip("chk.ignoreAll")` then `isConfirmSkipped("chk.ignoreAll")` is true, `isConfirmSkipped("scu.closeOnly")` false.
  - `clearSkipped("chk")` removes `chk.*` and keeps `scu.closeOnly`; `hasSkipped` follows.
  - Stored value `"{not json"` or `"42"` → `isConfirmSkipped` false, `rememberSkip` then works.
  - `localStorage.getItem` / `setItem` throwing → every call returns false/undefined, nothing thrown.
  - No `localStorage` global at all → same.
  - `rememberSkip` twice stores the id once.

- [ ] **Step 2: Run** `npx vitest run src/ui/skipped-confirms.test.ts`: Expected: FAIL.
- [ ] **Step 3: Implement.** Read the whole list each call (no module cache: two tabs share the browser).
- [ ] **Step 4: Run** the same command: Expected: PASS. Verify loop.
- [ ] **Step 5: Commit**: `feat(ui): remember which confirmations an editor chose to skip`

---

### Task 3: URs assistant

**Files:**
- Modify: `src/speed-camera-urs/confirm-spec.ts` (`closeOnlySpec`, `closeStaleSpec`), `close.ts:540-640` (`runCloseOne`, `runCloseStale`, every `notify(...)`), `prompt.ts`, `ui/tab.ts:150-163` (reset button at the bottom), `locales/*/common.json` (`speedCameraUrs`)
- Test: `src/speed-camera-urs/flows.test.ts`, `confirm-spec.test.ts`, `close.test.ts`

**Interfaces:**
- Consumes: `ConfirmSpec`, `SkipOption`, `NoticeSpec` (Task 1); `skipOption`, `hasSkipped`, `clearSkipped` (Task 2); `canBatch`, `canBatchStale` (`close.ts:121-130`).
- Produces: `closeOnlySpec(id: number, skip?: SkipOption)`, `closeStaleSpec(id: number, ageDays: number, skip?: SkipOption)`; `type Notify = (notice: { title: string; text: string }) => Promise<void>` in `prompt.ts`.

New keys in `speedCameraUrs` (English shown, translate to fr/de/it): `dlgSkip` "Don't show again", `noticeTitleDone` "Done", `noticeTitleError` "Nothing was changed", `noticeTitleRank` "Level too low", `resetSkipped` "Show skipped confirmations again". `closeTrafficLightSpec`, `closeOneSpec`, `askMapMateSpec`, `closeSelectedSpec` get no skip.

- [ ] **Step 1: Write the failing flow tests**
  - `runCloseOne` on an already-messaged UR at rank 2: spec has `skip`; at rank 1: no `skip`, even after `rememberSkip("scu.closeOnly")`, and the confirm stub is called.
  - `runCloseStale` at rank 3: spec has `skip`; at rank 2: no `skip`.
  - `rememberSkip("scu.closeStale")`, rank 3, real `showConfirm` replaced by a stub that honours `skip.isSkipped` (returns true without recording): a UR whose reporter wrote last after the scan → outcome is not `"closed"` (the re-read in `closeStale` still refuses).
  - `runCloseTrafficLight`, `runCloseOne` (with message), `runAskMapMate`, `runCloseSelected`: the spec never has `skip`, at rank 5.
  - Every `notify` call receives `{ title, text }` with a non-empty title.
- [ ] **Step 2: Run** `npx vitest run src/speed-camera-urs`: Expected: FAIL.
- [ ] **Step 3: Implement.** In `runCloseOne`: `closeOnlySpec(id, canBatch(sdk) ? skipOption("scu.closeOnly", t("dlgSkip")) : undefined)`; same pattern with `canBatchStale` and `"scu.closeStale"`. Titles: `noticeTitleRank` for `errBatchRank`, `noticeTitleError` when an outcome is not closed/asked, `noticeTitleDone` for batch summaries. Reset button: neutral `scu-btn` at the end of the pane, disabled when `!hasSkipped("scu")`, click → `clearSkipped("scu")` and disable itself.
- [ ] **Step 4: Run** the same command: Expected: PASS. Verify loop.
- [ ] **Step 5: Commit**: `feat(speed-camera-urs): "don't show again" on closures without a message`

---

### Task 4: Street-name checker

**Files:**
- Create: `src/street-name-checker/confirm-spec.ts`, `confirm-spec.test.ts`
- Modify: `src/street-name-checker/prompt.ts`, `fix.ts` (`runFix`, `runFixGroup`, `ignoreIssues`), `ui/settings-panel.ts:178-187`, `locales/*/common.json` (`streetCheck`)
- Test: `src/street-name-checker/fix.test.ts` (every `confirm: async (message) => …` becomes a spec)

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `type Confirm = (spec: ConfirmSpec) => Promise<boolean>`, `type Notify = (notice: { title: string; text: string }) => Promise<void>`, and

```ts
export function overLockSpec(expectedLock: number | string, segments: number): ConfirmSpec;
export function wrongStreetSpec(current: string, suggestion: string, coverage?: number, distanceM?: number): ConfirmSpec;
export function groupRenameSpec(n: number, current: string, suggestion: string): ConfirmSpec;
export function ignoreAllSpec(n: number): ConfirmSpec;   // the only one with skip: skipOption("chk.ignoreAll", t("dialogSkip"))
```

`wrongStreetSpec` puts the confidence figures in `note` and the "verdict comes from geometry, check the map" sentence in `warning` (mockup 1). Every spec says in its facts that nothing is saved automatically. New keys replace `confirmOverLockFix`, `confirmWrongStreetFix`, `confirmGroupFixDetailed`, `confirmIgnoreAll`, `noteMatchConfidence` (delete those after); add `dialogSkip`, `noticeTitleError`, `noticeTitleRank`, `resetSkipped`.

- [ ] **Step 1: Write the failing tests:** each builder's title and facts contain the names and counts it was given; `ignoreAllSpec` has `skip`, the three others never do; `runFix` on a `WRONG_STREET` issue passes a spec with no `skip` and with `note` containing the percentage; `ignoreIssues` above the threshold passes `ignoreAllSpec`; `errGroupFixRank` reaches `notify` as `{ title, text }`.
- [ ] **Step 2: Run** `npx vitest run src/street-name-checker`: Expected: FAIL.
- [ ] **Step 3: Implement.** `prompt.ts` keeps its injectable shape, now `showConfirm(spec)` / `showNotice({ ...notice, okLabel: t("dialogOk") })`. Reset button next to `resetIgnoredBtn`, same row style, disabled when `!hasSkipped("chk")`, click → `clearSkipped("chk")` then `ctx.rebuild()`.
- [ ] **Step 4: Run** the same command: Expected: PASS. Verify loop.
- [ ] **Step 5: Commit**: `feat(street-name-checker): structured confirmations, "don't show again" on ignore all`

---

### Task 5: House-number importer

**Files:**
- Create: `src/house-number-importer/confirm-spec.ts`, `confirm-spec.test.ts`
- Modify: `prompt.ts`, `import.ts` (`runImportPoint`, mass import, `describeFailure` callers), `controller.ts:420-426`, `locales/*/common.json` (`hnImport`)
- Test: `src/house-number-importer/import.test.ts`, `controller.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: same `Confirm` / `Notify` shapes as Task 4, and

```ts
export function singleImportSpec(number: string, street: string, onSkip: () => void): ConfirmSpec; // skip: { label, isSkipped: false, remember: onSkip }
export function massImportSpec(args: { count: number; cap?: number; total?: number; street: string;
  numbers: string; segments: number; unverifiedName: boolean }): ConfirmSpec;          // no skip
```

`runImportPoint` options gain `onSkipConfirm?: () => void`; the controller passes `() => this.settings.update({ confirmSingleImport: false })`. Mass import: numbers list in `note`, the segments spread and the review sentence as facts, the unverified-name sentence as `warning`. Replace `confirmSingleImport` (the string key, not the setting), `confirmMassImport*` keys; add `dialogSkip`, `noticeTitleDone`, `noticeTitleError`.

- [ ] **Step 1: Write the failing tests:** confirming `singleImportSpec` with `remember()` called → controller settings now have `confirmSingleImport: false`; `massImportSpec` never has `skip`, and has `warning` only when `unverifiedName`; capped import states cap and total in the title or facts; `importedCount` reaches `notify` with the "done" title.
- [ ] **Step 2: Run** `npx vitest run src/house-number-importer`: Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command: Expected: PASS. Verify loop.
- [ ] **Step 5: Commit**: `feat(house-number-importer): structured confirmations; "don't show again" turns the single-import confirmation off`

---

### Task 6: Public transport stops, end of `showWmeDialog`

**Files:**
- Create: `src/publicTransportDialogs.ts`, `src/publicTransportDialogs.test.ts`
- Modify: `src/publicTransportStopsLayer.ts:957-990, 1240-1310`, `src/utils.ts:40-160` (delete `showWmeDialog` and `DialogOptions`), `main.user.ts:143-224` (reset button), `locales/*/common.json` (`deleteObsoleteStop`, `venueMatchDialog`)

**Interfaces:**
- Consumes: Tasks 1 and 2; host `i18next` (`common:` namespace).
- Produces:

```ts
export function deleteObsoleteSpec(name: string): ConfirmSpec;            // danger: true, skip: skipOption("pt.deleteObsolete", …)
export function pickVenueSpec(names: string[]): ChoiceSpec<string>;       // values "0".."n-1", label = name or "#i"
export function mergeActionSpec(name: string, sameCoord: boolean): ChoiceSpec<"merge" | "merge-with-coords" | "save">;
```

`mergeActionSpec` omits `merge-with-coords` when `sameCoord` (current behaviour), each choice has a one-sentence `description` (mockup 4). `venueMatchDialog.message` loses its `<br/>` and `<pre>`; new keys for titles, facts, descriptions, `dialogSkip`, `resetSkipped`.

- [ ] **Step 1: Write the failing tests:** `deleteObsoleteSpec` is danger with skip id `pt.deleteObsolete`; `mergeActionSpec(…, true)` has two choices, `(…, false)` three, in the order merge, merge-with-coords, save; no string in any spec contains `<`; `pickVenueSpec(["", "Bern"])` labels `#1`, `Bern`.
- [ ] **Step 2: Run** `npx vitest run src/publicTransportDialogs.test.ts`: Expected: FAIL.
- [ ] **Step 3: Implement**, replace the three `showWmeDialog` calls (`null` from `showChoice` maps to the existing `"cancel"` / `undefined` paths), delete `showWmeDialog` from `utils.ts`. In `addScriptTab`, after `tabPane.innerHTML = …`, append one neutral button built with `el` from `src/ui/dom.ts`, disabled when `!hasSkipped("pt")`, click → `clearSkipped("pt")`.
- [ ] **Step 4: Run** `grep -rn showWmeDialog src main.user.ts`: Expected: no output. `npm test`: Expected: PASS. Verify loop.
- [ ] **Step 5: Commit**: `feat(pt-stops): structured dialogs, drop showWmeDialog`

---

### Task 7: Docs and smoke test

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `README.fr.md`, `README.de.md`, `README.it.md`

- [ ] **Step 1: `CLAUDE.md`.** URs section: the paragraph on `confirm-spec.ts` + `ui/dialog.ts` now points at `src/ui/dialog.ts` as the shared dialog of every feature. Add one short "Dialogs" subsection under Architecture: shared component, store key, the skippable ids list, "a remembered skip never applies when the spec quotes a conversation", "the URs skip only exists at batch rank, decided in `close.ts`". Add to the checker's and URs' safety rules: geometric verdicts, messages, group actions and freeway lights never carry a skip, and the flow tests assert it.
- [ ] **Step 2: READMEs**, under `[Unreleased]`: *Changed*: every popup now has the same look (title, list of what changes, Cancel selected by default). *Added*: "Don't show again" on simple confirmations, with a button to show them again in each tab. Same content in all four.
- [ ] **Step 3: Full verify:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`: Expected: all succeed.
- [ ] **Step 4: Manual smoke test in WME** (light then dark skin): wrong-street fix, ignore all with box ticked then reset, single HN import with confirmation on and box ticked, PT obsolete delete and merge choice, URs already-messaged close at level 3+ and below, Escape in each.
- [ ] **Step 5: Commit**: `docs: unified dialogs and "don't show again"`
