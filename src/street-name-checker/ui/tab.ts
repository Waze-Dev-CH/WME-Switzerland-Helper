import type { LineString } from "geojson";
import type { WmeSDK } from "wme-sdk-typings";
import {
  GROUP_FIX_CAP,
  ignoreIssue,
  ignoreIssues,
  LOCK_STATUSES,
  runFix,
  runFixGroup,
} from "../fix";
import { LANGUAGE_CHOICES, resolveLocale, setLocale, t, type LanguagePreference, type StringKey } from "../i18n";
import { STATUS_STYLES } from "../map-layer";
import { type Issue, type IssueNote, type IssueStatus } from "../matching/evaluate";
import type { ScanSnapshot, Scanner } from "../scan";
import { ALL_STATUSES, ROAD_TYPE_OPTIONS, type CityScoping, type Settings, type SettingsStore } from "../settings";
import { mapGeoAdminUrlForGeometry } from "../geoadmin/links";
import type { Bbox } from "../geoadmin/types";
import { getLocale } from "../i18n";
import { cantonMapLink } from "./canton-link";
import { injectStyles } from "./styles";

// Road type names stay in English on purpose: they are the WME community's
// shared vocabulary and Waze's own localized terms vary by UI version.
const ROAD_TYPE_LABELS = new Map(ROAD_TYPE_OPTIONS.map((r) => [r.id, r.label]));

export const LEGEND_KEYS: Record<IssueStatus, StringKey> = {
  COSMETIC: "legendCOSMETIC",
  VARIANT: "legendVARIANT",
  NEAR: "legendNEAR",
  WRONG_TYPE: "legendWRONG_TYPE",
  BILINGUAL: "legendBILINGUAL",
  WRONG_STREET: "legendWRONG_STREET",
  WRONG_CITY: "legendWRONG_CITY",
  NOT_FOUND: "legendNOT_FOUND",
  UNNAMED: "legendUNNAMED",
  UNDER_LOCK: "legendUNDER_LOCK",
  MICRO_SEGMENT: "legendMICRO_SEGMENT",
  LOOP: "legendLOOP",
  NARROW_MISUSE: "legendNARROW_MISUSE",
  OVER_LOCK: "legendOVER_LOCK",
  UNNAMED_NO_MATCH: "legendUNNAMED_NO_MATCH",
};

export const STATE_KEYS: Record<ScanSnapshot["state"], StringKey> = {
  idle: "stateIdle",
  disabled: "stateDisabled",
  "outside-ch": "stateOutsideCh",
  "zoom-gated": "stateZoomGated",
  "area-gated": "stateAreaGated",
  fetching: "stateFetching",
  evaluating: "stateEvaluating",
  sweeping: "stateSweeping",
  done: "stateDone",
  paused: "statePaused",
  error: "stateError",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Perceived-luminance verdict for a CSS color; null when transparent or unparseable. */
export function isDarkBackground(cssColor: string): boolean | null {
  const match = cssColor.match(/rgba?\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  const parts = match[1].split(",").map((p) => parseFloat(p));
  const r = parts[0] ?? 0;
  const g = parts[1] ?? 0;
  const b = parts[2] ?? 0;
  const a = parts[3] ?? 1;
  if (a <= 0) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * Detect WME's editor theme by measuring the first opaque background up the
 * pane's ancestry and checking its perceived luminance. This follows the actual
 * editor skin rather than the OS prefers-color-scheme, which can disagree.
 */
function wmeThemeIsDark(start: HTMLElement): boolean {
  let node: HTMLElement | null = start;
  while (node) {
    const verdict = isDarkBackground(getComputedStyle(node).backgroundColor);
    if (verdict !== null) return verdict;
    node = node.parentElement;
  }
  return false;
}

/** Leading emoji for a status, or "" when none. WRONG_STREET is flagged: a different
 *  official street runs under a validly-named segment — easy to miss in the list. */
export function statusEmoji(status: IssueStatus): string {
  return status === "WRONG_STREET" ? "⚠️" : "";
}

export function formatNote(note: IssueNote | null): string {
  if (!note) return "";
  const parts: string[] = [];
  if (note.unofficial) parts.push(t("noteUnofficial"));
  if (note.planned) parts.push(t("notePlanned"));
  if (note.fullLabel) parts.push(t("noteFullLabel", { label: note.fullLabel }));
  if (note.existsIn) parts.push(t("noteExistsIn", { place: note.existsIn }));
  if (note.ownDistanceM !== undefined) parts.push(t("noteOwnDistance", { m: note.ownDistanceM }));
  if (note.currentLock !== undefined && note.expectedLock !== undefined) {
    // currentLock / expectedLock are already 1-6 levels (see guidelines.ts).
    parts.push(t("noteLock", { current: note.currentLock, expected: note.expectedLock }));
  }
  return parts.join(", ");
}

export interface IssueGroup {
  key: string;
  status: IssueStatus;
  currentName: string | null;
  suggestion: string | null;
  note: IssueNote | null;
  fixable: boolean;
  issues: Issue[];
}

/** Display order: safe fixes first, then risky ones, unnamed and guideline checks last. */
const SEVERITY_ORDER: Record<IssueStatus, number> = {
  COSMETIC: 0,
  VARIANT: 1,
  BILINGUAL: 2,
  NEAR: 3,
  WRONG_TYPE: 4,
  WRONG_STREET: 5,
  WRONG_CITY: 6,
  NOT_FOUND: 7,
  UNNAMED: 8,
  UNDER_LOCK: 9,
  MICRO_SEGMENT: 10,
  LOOP: 11,
  NARROW_MISUSE: 12,
  OVER_LOCK: 13,
  UNNAMED_NO_MATCH: 14,
};

export function groupIssues(issues: Iterable<Issue>): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.status}|${issue.currentName ?? ""}|${issue.suggestion ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        status: issue.status,
        currentName: issue.currentName,
        suggestion: issue.suggestion,
        note: issue.note,
        fixable: issue.fixable,
        issues: [],
      };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }
  return [...groups.values()].sort(
    (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] || b.issues.length - a.issues.length,
  );
}

/**
 * True when the segment's bounding box overlaps the viewport bbox. Using a
 * bbox overlap (rather than "a vertex falls inside") also keeps a long segment
 * that crosses the screen without any vertex inside it.
 */
export function geometryIntersectsBbox(geometry: LineString, bbox: Bbox): boolean {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const point of geometry.coordinates) {
    const lon = point[0] as number;
    const lat = point[1] as number;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) return false;
  return minLon <= bbox[2] && maxLon >= bbox[0] && minLat <= bbox[3] && maxLat >= bbox[1];
}

/**
 * Padded bounding box around every segment of a group, or null when no issue
 * carries coordinates. 30% padding with a floor so a single short segment
 * keeps street-level context.
 */
export function bboxOfIssues(issues: Issue[]): Bbox | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const issue of issues) {
    for (const point of issue.geometry.coordinates) {
      const lon = point[0] as number;
      const lat = point[1] as number;
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLon)) return null;
  const padLon = Math.max((maxLon - minLon) * 0.3, 0.001);
  const padLat = Math.max((maxLat - minLat) * 0.3, 0.0007);
  return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat];
}

/** Delay before the "updating" veil appears, to avoid flashing on quick rescans. */
const BUSY_DELAY_MS = 250;

export class TabUI {
  private pane!: HTMLElement;
  private statusLine!: HTMLElement;
  private statusText!: HTMLElement;
  private bannerBtn!: HTMLButtonElement;
  private warnLine!: HTMLElement;
  private unsavedBadge!: HTMLElement;
  private chipsBox!: HTMLElement;
  private groupsBox!: HTMLElement;
  private activeFilters = new Set<IssueStatus>();
  private expandedGroups = new Set<string>();
  /** Last issues map rendered into chips/groups, to skip redundant DOM rebuilds. */
  private lastRenderedIssues: ReadonlyMap<number, Issue> | null = null;
  private selectedSegmentIds = new Set<number>();
  private orderedIssueIds: number[] = [];
  private nextIssuePointer = -1;
  private listBox!: HTMLElement;
  /** Pending timer that veils the list; null when idle or already veiled. */
  private busyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Debounce timer for viewport re-filtering on pan; null when idle. */
  private panTimer: ReturnType<typeof setTimeout> | null = null;
  /** Checkboxes of the duplicated viewport-only toggle (master row + Settings). */
  private viewportInputs: HTMLInputElement[] = [];
  /** Last theme re-measure timestamp (belt-and-braces next to the observer). */
  private lastThemeCheck = 0;

  constructor(
    private sdk: WmeSDK,
    private scanner: Scanner,
    private settings: SettingsStore,
    /** Routed through activation.ts so this toggle and the layer checkbox stay in step. */
    private onEnabledChange: (enabled: boolean) => void,
  ) {}

  async init(): Promise<void> {
    injectStyles();
    const { tabLabel, tabPane } = await this.sdk.Sidebar.registerScriptTab();
    tabLabel.textContent = `🇨🇭 ${t("appName")}`;
    this.pane = tabPane;
    this.applyTheme();
    this.watchWmeTheme();
    this.buildSkeleton();
    this.scanner.onUpdate((snapshot) => this.render(snapshot));
    this.sdk.Events.on({
      eventName: "wme-selection-changed",
      eventHandler: () => this.syncSelection(),
    });
    // Track the visible viewport live: re-filter the already-scanned issues to
    // what is on screen, without refetching or rescanning. The issues map is
    // unchanged on a pan, so force past the identity guard in render().
    this.sdk.Events.on({
      eventName: "wme-map-move-end",
      eventHandler: () => {
        if (!this.settings.get().viewportOnly) return;
        // Debounce: a continuous drag-pan fires move-end repeatedly, each forcing a
        // full list rebuild (replaceChildren on chips + groups). Coalesce them.
        if (this.panTimer !== null) clearTimeout(this.panTimer);
        this.panTimer = setTimeout(() => {
          this.panTimer = null;
          this.render(this.scanner.getSnapshot(), true);
        }, 200);
      },
    });
    this.render(this.scanner.getSnapshot());
  }

  /** Re-measure the WME skin and apply our dark class only when it changed. */
  private applyTheme(): void {
    const dark = wmeThemeIsDark(this.pane);
    document.documentElement.classList.toggle("chk-theme-dark", dark);
  }

  /**
   * WME can switch skins at runtime without a page reload. Any skin switch
   * churns class/style attributes on body or html, so observe those as a
   * trigger to re-measure the actual background luminance. Our own class
   * toggle re-fires the observer once with an identical measurement, so the
   * chain stops immediately. The delayed re-check covers async stylesheet
   * swaps that land after the attribute change.
   */
  private watchWmeTheme(): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const remeasure = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.applyTheme();
        setTimeout(() => this.applyTheme(), 500);
      }, 150);
    };
    const observer = new MutationObserver(remeasure);
    const options = {
      attributes: true,
      attributeFilter: ["class", "style", "wz-theme", "data-theme"],
    };
    observer.observe(document.documentElement, options);
    observer.observe(document.body, options);
  }

  /** Rebuild all static DOM (after a language change). */
  private rebuild(): void {
    this.pane.replaceChildren();
    this.buildSkeleton();
    this.lastRenderedIssues = null;
    this.render(this.scanner.getSnapshot());
  }

  private buildSkeleton(): void {
    this.pane.classList.add("chk-pane");
    this.viewportInputs = []; // rebuild() re-creates both toggle instances

    const brand = el("div", "chk-brand");
    brand.append(
      el("span", "chk-brand-icon", "🇨🇭"),
      el("span", "chk-brand-title", t("appName")),
    );

    const toolbar = el("div", "chk-toolbar");
    const rescanBtn = el("button", "chk-btn", t("rescan"));
    rescanBtn.title = t("rescanTitle");
    rescanBtn.addEventListener("click", () => this.scanner.rescan());
    const nextBtn = el("button", "chk-btn", t("nextIssue"));
    nextBtn.title = t("nextIssueTitle");
    nextBtn.addEventListener("click", () => this.selectNextIssue());
    this.unsavedBadge = el("span", "chk-unsaved", "");
    toolbar.append(rescanBtn, nextBtn, this.unsavedBadge);

    // The banner holds a text span plus an action button (Scan this area /
    // Cancel), so render() must only touch the span, not the whole banner.
    this.statusLine = el("div", "chk-banner");
    this.statusText = el("span", "chk-banner-text", t("stateIdle"));
    this.bannerBtn = el("button", "chk-btn chk-banner-btn", "");
    this.bannerBtn.hidden = true;
    this.bannerBtn.addEventListener("click", () => {
      if (this.scanner.getSnapshot().state === "sweeping") this.scanner.cancelSweep();
      else void this.scanner.scanArea();
    });
    this.statusLine.append(this.statusText, this.bannerBtn);
    this.warnLine = el("div", "chk-warn");
    this.warnLine.hidden = true;
    this.chipsBox = el("div", "chk-chips");
    this.groupsBox = el("div", "chk-groups");
    this.listBox = el("div", "chk-list");
    const busy = el("div", "chk-busy");
    busy.append(el("span", "chk-spinner"), el("span", "chk-busy-text", t("updating")));
    this.listBox.append(this.chipsBox, this.groupsBox, busy);

    this.pane.append(
      brand,
      toolbar,
      this.statusLine,
      this.warnLine,
      this.buildMasterToggles(),
      this.listBox,
      this.buildLegend(),
      this.buildSettings(),
      this.buildFooter(),
    );
  }

  private buildMasterToggles(): HTMLElement {
    const row = el("div", "chk-master");
    const settings = this.settings.get();
    row.append(
      this.toggleSwitch(
        t("toggleEnabled"),
        settings.enabled,
        (checked) => this.onEnabledChange(checked),
        t("toggleEnabledTitle"),
      ),
      this.toggleSwitch(
        t("toggleAutoScan"),
        settings.autoScan,
        (checked) => {
          this.settings.update({ autoScan: checked });
          if (checked && this.settings.get().enabled) this.scanner.requestScan();
        },
        t("toggleAutoScanTitle"),
      ),
      // surfaced here because it silently changes the list and every counter;
      // the Settings entry remains, both stay in sync via viewportInputs
      this.viewportOnlyToggle(),
    );
    return row;
  }

  /**
   * Viewport-only toggle, shown both in the master row and in Settings. The
   * settings store has no observer, so every instance registers its checkbox
   * and the shared handler mirrors the state across them.
   */
  private viewportOnlyToggle(): HTMLElement {
    const label = this.toggleSwitch(
      t("viewportOnly"),
      this.settings.get().viewportOnly,
      (checked) => {
        this.settings.update({ viewportOnly: checked });
        for (const input of this.viewportInputs) input.checked = checked;
        // display-only filter: refresh the rendered list, no rescan
        this.render(this.scanner.getSnapshot(), true);
      },
      t("viewportOnlyTitle"),
    );
    const input = label.querySelector("input");
    if (input) this.viewportInputs.push(input);
    return label;
  }

  /** iOS-style toggle: a visually hidden checkbox plus a CSS track/knob and a label. */
  private toggleSwitch(
    text: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    title?: string,
  ): HTMLElement {
    const label = el("label", "chk-switch");
    if (title) label.title = title;
    const input = el("input") as HTMLInputElement;
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const track = el("span", "chk-switch-track");
    track.appendChild(el("span", "chk-switch-knob"));
    label.append(input, track, el("span", "chk-switch-label", text));
    return label;
  }

  /** A collapsible settings sub-section with an icon header. */
  private buildSubsection(icon: string, title: string, children: HTMLElement[]): HTMLElement {
    const details = el("details", "chk-subsection");
    const summary = el("summary");
    summary.append(el("span", "chk-section-icon", icon), el("span", "", title));
    details.appendChild(summary);
    const body = el("div", "chk-subsection-body");
    for (const child of children) body.appendChild(child);
    details.appendChild(body);
    return details;
  }

  private buildFooter(): HTMLElement {
    const footer = el("div", "chk-footer");
    const link = el("a", "", "Changelog");
    link.href = "https://github.com/Waze-Dev-CH/WME-CH-Street-Name-Checker/blob/main/CHANGELOG.md";
    link.target = "_blank";
    link.rel = "noopener";
    footer.appendChild(link);
    return footer;
  }

  private buildLegend(): HTMLElement {
    const details = el("details", "chk-section");
    const summary = el("summary");
    summary.append(el("span", "chk-section-icon", "🎨"), el("span", "", t("legendTitle")));
    details.appendChild(summary);
    const body = el("div", "chk-section-body");
    for (const status of Object.keys(STATUS_STYLES) as IssueStatus[]) {
      const row = el("div", "chk-settings-row");
      const dot = el("span", "chk-dot");
      dot.style.background = STATUS_STYLES[status].strokeColor;
      row.append(dot, el("span", "", `${status}: ${t(LEGEND_KEYS[status])}`));
      body.appendChild(row);
    }
    details.appendChild(body);
    return details;
  }

  private render(snapshot: ScanSnapshot, force = false): void {
    // covers a skin switch the attribute observer cannot see (stylesheet swap)
    if (Date.now() - this.lastThemeCheck > 5000) {
      this.lastThemeCheck = Date.now();
      this.applyTheme();
    }
    const { state, issues, stats, officialStreetCount, progress, error } = snapshot;
    // Base set for the list and counters: the segments currently on screen
    // (or all scanned ones when the viewport filter is off / unavailable).
    const inViewport = this.inViewport(issues);

    let statusText = t(STATE_KEYS[state]);
    if (state === "fetching" && progress) statusText += ` ${progress.done}/${progress.total}`;
    if (state === "area-gated" && !snapshot.sweepEligible) statusText = t("sweepTooLarge");
    if (state === "sweeping") {
      statusText = t("stateSweeping", {
        done: snapshot.sweep?.tilesDone ?? 0,
        total: snapshot.sweep?.tilesTotal ?? 0,
      });
    }
    if (state === "done") {
      statusText = t("stateDone", {
        issues: inViewport.length,
        ok: stats.ok + stats.okAlt,
        streets: officialStreetCount,
      });
    }
    if (state === "error" && error) statusText += `: ${error}`;
    this.statusText.textContent = statusText;
    this.statusLine.classList.toggle("chk-error", state === "error");
    this.statusLine.classList.toggle("chk-banner-ok", state === "done" && inViewport.length === 0);
    this.renderBannerButton(snapshot);
    this.renderWarnings(snapshot);
    // The sweep streams partial results into the list batch by batch; veiling
    // it for the sweep's whole duration would hide exactly what it publishes.
    this.setBusy(state === "fetching" || state === "evaluating");

    this.unsavedBadge.textContent =
      snapshot.unsavedCount > 0 ? t("unsavedBadge", { n: snapshot.unsavedCount }) : "";

    // Progress ticks reuse the same issues map: only the status line above
    // changes, skip the expensive chips/groups DOM rebuild. Map moves force
    // past this guard since the viewport (not the issues map) changed.
    if (!force && issues === this.lastRenderedIssues) return;
    this.lastRenderedIssues = issues;

    const visible = this.applyStatusFilters(inViewport);
    const groups = groupIssues(visible);
    // "next issue" follows the displayed order (severity, then volume)
    this.orderedIssueIds = groups.flatMap((g) => g.issues.map((i) => i.segmentId));
    this.renderChips(inViewport);
    this.renderGroups(groups, visible.length, state);
  }

  /** Banner action: start a sweep when area-gated (and eligible), cancel one while sweeping. */
  private renderBannerButton(snapshot: ScanSnapshot): void {
    const { state } = snapshot;
    if (state === "sweeping") {
      this.bannerBtn.hidden = false;
      this.bannerBtn.textContent = t("cancelSweep");
      this.bannerBtn.title = "";
    } else if (state === "area-gated" && snapshot.sweepEligible) {
      this.bannerBtn.hidden = false;
      this.bannerBtn.textContent = t("scanArea");
      this.bannerBtn.title = t("scanAreaTitle");
    } else {
      this.bannerBtn.hidden = true;
    }
  }

  /** Data-quality caveats for the finished scan (truncated/failed tiles, lookup cap). */
  private renderWarnings(snapshot: ScanSnapshot): void {
    const parts: string[] = [];
    if (snapshot.state === "done") {
      if (snapshot.truncatedTileCount > 0) {
        parts.push(t("warnTruncated", { n: snapshot.truncatedTileCount }));
      }
      if (snapshot.failedTileCount > 0) {
        parts.push(t("warnFailedTiles", { n: snapshot.failedTileCount }));
      }
      if (snapshot.continuationLookupsExhausted) parts.push(t("warnContinuationCap"));
    }
    this.warnLine.hidden = parts.length === 0;
    this.warnLine.textContent = parts.join(" · ");
  }

  /**
   * Veil the issue list with a blur + spinner while a scan is in flight. Delayed
   * so the frequent, fast rescans on map moves don't make it flash.
   */
  private setBusy(updating: boolean): void {
    if (updating) {
      if (this.busyTimer !== null || this.listBox.classList.contains("chk-busy-active")) return;
      this.busyTimer = setTimeout(() => {
        this.busyTimer = null;
        this.listBox.classList.add("chk-busy-active");
      }, BUSY_DELAY_MS);
    } else {
      if (this.busyTimer !== null) {
        clearTimeout(this.busyTimer);
        this.busyTimer = null;
      }
      this.listBox.classList.remove("chk-busy-active");
    }
  }

  /** Read the visible map extent; null (filter disabled) on any SDK failure. */
  private currentViewport(): Bbox | null {
    try {
      return this.sdk.Map.getMapExtent() as Bbox;
    } catch {
      return null;
    }
  }

  /** Issues restricted to the on-screen viewport, unless the filter is off. */
  private inViewport(issues: ReadonlyMap<number, Issue>): Issue[] {
    const all = [...issues.values()];
    if (!this.settings.get().viewportOnly) return all;
    const bbox = this.currentViewport();
    if (!bbox) return all;
    return all.filter((issue) => geometryIntersectsBbox(issue.geometry, bbox));
  }

  private applyStatusFilters(issues: Issue[]): Issue[] {
    return issues.filter(
      (issue) => this.activeFilters.size === 0 || this.activeFilters.has(issue.status),
    );
  }

  private renderChips(issues: Issue[]): void {
    this.chipsBox.replaceChildren();
    const counts = new Map<IssueStatus, number>();
    for (const issue of issues) {
      counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
    }
    for (const status of Object.keys(STATUS_STYLES) as IssueStatus[]) {
      const count = counts.get(status) ?? 0;
      if (count === 0) continue;
      const chip = el("button", "chk-chip");
      chip.classList.toggle("chk-chip-active", this.activeFilters.has(status));
      chip.setAttribute("aria-pressed", String(this.activeFilters.has(status)));
      const dot = el("span", "chk-dot");
      dot.style.background = STATUS_STYLES[status].strokeColor;
      chip.append(dot, `${status} ${count}`);
      chip.title = t("filterChipTitle");
      chip.addEventListener("click", () => {
        if (this.activeFilters.has(status)) this.activeFilters.delete(status);
        else this.activeFilters.add(status);
        this.render(this.scanner.getSnapshot(), true);
      });
      this.chipsBox.appendChild(chip);
    }
  }

  private renderGroups(
    groups: IssueGroup[],
    visibleCount: number,
    state: ScanSnapshot["state"],
  ): void {
    const scrollTop = this.groupsBox.scrollTop;
    this.groupsBox.replaceChildren();
    if (visibleCount === 0) {
      if (state === "done") {
        this.groupsBox.appendChild(el("div", "chk-empty", t("allMatch")));
      } else if (state === "zoom-gated" || state === "area-gated") {
        this.groupsBox.appendChild(el("div", "chk-muted", t(STATE_KEYS[state])));
      }
      return;
    }
    for (const group of groups) {
      this.groupsBox.appendChild(this.renderGroup(group));
    }
    this.groupsBox.scrollTop = scrollTop;
  }

  private renderGroup(group: IssueGroup): HTMLElement {
    const box = el("div", "chk-group");
    const header = el("div", "chk-group-header");
    // dot + visible status code (same pattern as the chips), so the status is
    // not conveyed by color alone
    const badge = el("span", "chk-status");
    badge.append(el("span", `chk-badge chk-badge-${group.status}`), el("span", "chk-status-code", group.status));

    const noteText = formatNote(group.note);
    // a real button (styled as plain text) so expand/collapse works with the
    // keyboard; its click bubbles to the header listener below
    const names = el("button", "chk-group-names chk-group-toggle");
    const expanded = this.expandedGroups.has(group.key) || group.issues.length === 1;
    names.setAttribute("aria-expanded", String(expanded));
    const emoji = statusEmoji(group.status);
    if (emoji) names.appendChild(el("span", "", `${emoji} `));
    names.appendChild(el("span", "", group.currentName ?? t("unnamed")));
    if (group.suggestion && group.suggestion !== group.currentName) {
      names.appendChild(el("span", "chk-arrow", "  →  "));
      names.appendChild(el("span", "chk-suggestion", group.suggestion));
    }
    if (noteText) {
      names.appendChild(el("span", "chk-note", ` (${noteText})`));
    }
    if (noteText) names.title = noteText;

    const count = el("span", "chk-count", `×${group.issues.length}`);
    const zoomBtn = el("button", "chk-locate chk-group-zoom", "⌖");
    zoomBtn.title = t("zoomToGroupTitle");
    zoomBtn.setAttribute("aria-label", t("zoomToGroupTitle"));
    zoomBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.zoomToGroup(group);
    });

    // Explicit lines instead of one flex-wrap soup: status/count/zoom on top,
    // the (possibly long) name on its own line, action buttons at the bottom.
    const topLine = el("div", "chk-group-top");
    topLine.append(badge, count, zoomBtn);
    header.append(topLine, names);

    const fixAllBtn =
      group.fixable && group.issues.length > 1
        ? el("button", "chk-fix-all", t("fixAll", { n: Math.min(group.issues.length, GROUP_FIX_CAP) }))
        : null;
    if (fixAllBtn) {
      fixAllBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.onFixGroup(group, fixAllBtn);
      });
    }
    // Ignore the whole group at once (any status, fixable or not).
    const ignoreAllBtn =
      group.issues.length > 1
        ? el("button", "chk-ignore", t("ignoreAll", { n: group.issues.length }))
        : null;
    if (ignoreAllBtn) {
      ignoreAllBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.onIgnoreGroup(group);
      });
    }
    if (fixAllBtn || ignoreAllBtn) {
      const actions = el("div", "chk-group-actions");
      if (fixAllBtn) actions.appendChild(fixAllBtn);
      if (ignoreAllBtn) actions.appendChild(ignoreAllBtn);
      header.appendChild(actions);
    }

    // expand/collapse only; the map moves solely via the explicit ⌖ buttons
    header.addEventListener("click", () => {
      if (this.expandedGroups.has(group.key)) this.expandedGroups.delete(group.key);
      else this.expandedGroups.add(group.key);
      this.render(this.scanner.getSnapshot(), true);
    });
    box.appendChild(header);

    if (this.expandedGroups.has(group.key) || group.issues.length === 1) {
      const rows = el("div", "chk-rows");
      for (const issue of group.issues) {
        rows.appendChild(this.renderRow(issue));
      }
      box.appendChild(rows);
    }
    return box;
  }

  private renderRow(issue: Issue): HTMLElement {
    const row = el("div", "chk-row");
    row.dataset["segmentId"] = String(issue.segmentId);
    const selected = this.selectedSegmentIds.has(issue.segmentId);
    row.classList.toggle("chk-selected", selected);
    if (selected) row.setAttribute("aria-current", "true");
    // a real button so segment selection works with the keyboard; its click
    // bubbles to the row listener below
    const meta = el(
      "button",
      "chk-row-meta chk-row-select",
      `${ROAD_TYPE_LABELS.get(issue.roadType) ?? `type ${issue.roadType}`} · ${Math.round(issue.length)} m${issue.cityName ? ` · ${issue.cityName}` : ""}`,
    );
    row.appendChild(meta);
    // controls on their own line under the meta, so the meta text keeps the
    // full row width instead of being squeezed into an early ellipsis
    const controls = el("div", "chk-row-controls");
    row.appendChild(controls);
    // both external-viewer links grouped in one bordered box, visually apart
    // from the in-map actions; one stopPropagation covers the whole box so a
    // near-miss click no longer selects the segment
    const links = el("span", "chk-row-links");
    links.addEventListener("click", (ev) => ev.stopPropagation());
    const geoLink = el("a", "chk-locate chk-geolink", "↗") as HTMLAnchorElement;
    geoLink.href = mapGeoAdminUrlForGeometry(issue.geometry, getLocale());
    geoLink.target = "_blank";
    geoLink.rel = "noopener";
    geoLink.title = t("geoAdminLinkTitle");
    geoLink.setAttribute("aria-label", t("geoAdminLinkTitle"));
    links.appendChild(geoLink);
    const cantonLink = cantonMapLink(issue.geometry, issue.cantonName);
    if (cantonLink) {
      cantonLink.classList.add("chk-locate");
      links.appendChild(cantonLink);
    }
    controls.appendChild(links);
    const locateBtn = el("button", "chk-locate", "⌖");
    locateBtn.title = t("locateTitle");
    locateBtn.setAttribute("aria-label", t("locateTitle"));
    locateBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.locateSegment(issue);
    });
    controls.appendChild(locateBtn);
    if (issue.fixable) {
      const fixBtn = el("button", "chk-fix-all", t("fix"));
      fixBtn.title = LOCK_STATUSES.has(issue.status)
        ? t("fixLockTitle", { n: issue.note?.expectedLock ?? "" })
        : t("fixTitle", { name: issue.suggestion ?? "" });
      fixBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.onFixOne(issue, fixBtn);
      });
      controls.appendChild(fixBtn);
    }
    const ignoreBtn = el("button", "chk-ignore", t("ignore"));
    ignoreBtn.title = t("ignoreTitle");
    ignoreBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.onIgnore(issue);
    });
    controls.appendChild(ignoreBtn);
    row.addEventListener("click", () => this.selectSegment(issue.segmentId));
    return row;
  }

  private onIgnore(issue: Issue): void {
    ignoreIssue(this.settings, issue, () => this.scanner.reevaluate());
  }

  private onIgnoreGroup(group: IssueGroup): void {
    void ignoreIssues(this.settings, group.issues, () => this.scanner.reevaluate());
  }

  /** Fit the map to every segment of the group, with padding for context. */
  private zoomToGroup(group: IssueGroup): void {
    // our own navigation must not trigger a rescan nor wipe the list
    this.scanner.suppressAutoScan();
    const bbox = bboxOfIssues(group.issues);
    if (!bbox) return;
    try {
      this.sdk.Map.zoomToExtent({ bbox });
      // never land below the scan gate: that state clears the issue list
      const minZoom = this.settings.get().minZoom;
      if (this.sdk.Map.getZoomLevel() < minZoom) {
        this.sdk.Map.setZoomLevel({ zoomLevel: Math.min(22, Math.max(12, minZoom)) as never });
      }
    } catch {
      // extent issue: ignore, the rows' locate buttons still work
    }
  }

  private locateSegment(issue: Issue): void {
    this.scanner.suppressAutoScan();
    try {
      this.sdk.Map.centerMapOnGeometry({ geometry: issue.geometry });
    } catch {
      // geometry may be stale; selection below still works if the segment is loaded
    }
    this.selectSegment(issue.segmentId);
  }

  private selectSegment(segmentId: number): void {
    try {
      this.sdk.Editing.setSelection({
        selection: { ids: [segmentId], objectType: "segment" },
      });
    } catch {
      // segment may have been unloaded since the scan; next scan will refresh the list
    }
  }

  selectNextIssue(): void {
    if (this.orderedIssueIds.length === 0) return;
    this.nextIssuePointer = (this.nextIssuePointer + 1) % this.orderedIssueIds.length;
    const segmentId = this.orderedIssueIds[this.nextIssuePointer];
    if (segmentId !== undefined) this.selectSegment(segmentId);
  }

  private syncSelection(): void {
    this.selectedSegmentIds.clear();
    const selection = this.sdk.Editing.getSelection();
    if (selection?.objectType === "segment") {
      for (const id of selection.ids) this.selectedSegmentIds.add(id as number);
    }
    let first: HTMLElement | null = null;
    this.groupsBox.querySelectorAll<HTMLElement>(".chk-row").forEach((row) => {
      const id = Number(row.dataset["segmentId"]);
      const selected = this.selectedSegmentIds.has(id);
      row.classList.toggle("chk-selected", selected);
      if (selected) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
      if (selected && !first) first = row;
    });
    (first as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  }

  private onFixOne(issue: Issue, button?: HTMLButtonElement): void {
    void runFix(this.sdk, issue, this.settings.get(), {
      button,
      onComplete: () => this.scanner.reevaluate(),
    });
  }

  private onFixGroup(group: IssueGroup, button?: HTMLButtonElement): void {
    void runFixGroup(
      this.sdk,
      group.issues,
      { status: group.status, expectedLock: group.note?.expectedLock, suggestion: group.suggestion },
      this.settings.get(),
      { button, onComplete: () => this.scanner.reevaluate() },
    );
  }

  private buildSettings(): HTMLElement {
    const details = el("details", "chk-section");
    const summary = el("summary");
    summary.append(el("span", "chk-section-icon", "⚙️"), el("span", "", t("settingsTitle")));
    details.appendChild(summary);
    const body = el("div", "chk-section-body");
    const settings = this.settings.get();

    const apply = (partial: Partial<Settings>, rescan = false): void => {
      this.settings.update(partial);
      if (rescan) this.scanner.requestScan();
      else this.scanner.reevaluate();
    };

    const grid = el("div", "chk-settings-grid");
    for (const option of ROAD_TYPE_OPTIONS) {
      const label = el("label");
      const cb = el("input") as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = settings.checkedRoadTypes.includes(option.id);
      cb.addEventListener("change", () => {
        const current = new Set(this.settings.get().checkedRoadTypes);
        if (cb.checked) current.add(option.id);
        else current.delete(option.id);
        apply({ checkedRoadTypes: [...current] });
      });
      label.append(cb, option.label);
      grid.appendChild(label);
    }

    const statusGrid = el("div", "chk-settings-grid");
    for (const status of ALL_STATUSES) {
      const label = el("label");
      label.title = t(LEGEND_KEYS[status]);
      const cb = el("input") as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = settings.enabledStatuses.includes(status);
      cb.addEventListener("change", () => {
        const current = new Set(this.settings.get().enabledStatuses);
        if (cb.checked) current.add(status);
        else current.delete(status);
        this.settings.update({ enabledStatuses: ALL_STATUSES.filter((s) => current.has(s)) });
        this.scanner.reevaluate();
      });
      const dot = el("span", "chk-dot");
      dot.style.background = STATUS_STYLES[status].strokeColor;
      label.append(cb, dot, status);
      statusGrid.appendChild(label);
    }

    const optionToggle = (
      textKey: StringKey,
      key: keyof Pick<
        Settings,
        | "altNameCountsAsOk"
        | "showMapLabels"
        | "keepOldNameAsAlt"
        | "guidelineChecks"
        | "editPanelHelper"
        | "geometryMatching"
        | "editableOnly"
      >,
      titleKey?: StringKey,
    ): HTMLElement =>
      this.toggleSwitch(
        t(textKey),
        settings[key],
        (checked) => apply({ [key]: checked }),
        titleKey ? t(titleKey) : undefined,
      );

    // second instance of the shared viewport-only toggle (see viewportOnlyToggle)
    const viewportToggle = this.viewportOnlyToggle();

    const options = [
      optionToggle("altOk", "altNameCountsAsOk", "altOkTitle"),
      optionToggle("showMapLabels", "showMapLabels"),
      optionToggle("keepOldName", "keepOldNameAsAlt", "keepOldNameTitle"),
      optionToggle("guidelineChecks", "guidelineChecks", "guidelineChecksTitle"),
      optionToggle("helperSetting", "editPanelHelper"),
      optionToggle("geometryMatching", "geometryMatching", "geometryMatchingTitle"),
      optionToggle("editableOnly", "editableOnly", "editableOnlyTitle"),
      viewportToggle,
    ];

    const scopingRow = el("div", "chk-settings-row");
    scopingRow.appendChild(el("span", "", t("scopingLabel")));
    const select = el("select") as HTMLSelectElement;
    const scopingLabels: Record<CityScoping, string> = {
      off: t("scopingOff"),
      warn: t("scopingWarn"),
      strict: t("scopingStrict"),
    };
    for (const value of ["off", "warn", "strict"] as CityScoping[]) {
      const opt = el("option", "", scopingLabels[value]) as HTMLOptionElement;
      opt.value = value;
      select.appendChild(opt);
    }
    select.value = settings.cityScoping;
    select.title = t("scopingTitle");
    select.addEventListener("change", () => apply({ cityScoping: select.value as CityScoping }));
    scopingRow.appendChild(select);

    const zoomRow = el("div", "chk-settings-row");
    zoomRow.appendChild(el("span", "", t("minZoomLabel")));
    const zoomInput = el("input") as HTMLInputElement;
    zoomInput.type = "number";
    zoomInput.min = "12";
    zoomInput.max = "22";
    zoomInput.value = String(settings.minZoom);
    zoomInput.addEventListener("change", () => {
      const v = Number(zoomInput.value);
      if (Number.isFinite(v) && v >= 12 && v <= 22) apply({ minZoom: v }, true);
    });
    zoomRow.appendChild(zoomInput);

    const langRow = el("div", "chk-settings-row");
    langRow.appendChild(el("span", "", t("languageLabel")));
    const langSelect = el("select") as HTMLSelectElement;
    for (const choice of LANGUAGE_CHOICES) {
      const opt = el(
        "option",
        "",
        choice.value === "auto" ? t("languageAuto") : choice.label,
      ) as HTMLOptionElement;
      opt.value = choice.value;
      langSelect.appendChild(opt);
    }
    langSelect.value = settings.language;
    langSelect.addEventListener("change", () => {
      const language = langSelect.value as LanguagePreference;
      this.settings.update({ language });
      setLocale(resolveLocale(language, this.sdk.Settings.getLocale().localeCode));
      this.rebuild();
    });
    langRow.appendChild(langSelect);

    const ignoredRow = el("div", "chk-settings-row");
    ignoredRow.appendChild(el("span", "", t("ignoredCount", { n: settings.ignoredKeys.length })));
    const resetIgnoredBtn = el("button", "", t("resetIgnored")) as HTMLButtonElement;
    resetIgnoredBtn.disabled = settings.ignoredKeys.length === 0;
    resetIgnoredBtn.addEventListener("click", () => {
      this.settings.update({ ignoredKeys: [] });
      this.scanner.reevaluate();
      this.rebuild();
    });
    ignoredRow.appendChild(resetIgnoredBtn);

    body.append(
      this.buildSubsection("🛣️", t("roadTypesLabel"), [grid]),
      this.buildSubsection("🏷️", t("statusesLabel"), [statusGrid]),
      this.buildSubsection("🎛️", t("optionsLabel"), options),
      this.buildSubsection("📍", t("scopeDisplayLabel"), [scopingRow, zoomRow, langRow, ignoredRow]),
    );
    details.appendChild(body);
    return details;
  }
}
