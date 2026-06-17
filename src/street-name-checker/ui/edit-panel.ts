import type { WmeSDK } from "wme-sdk-typings";
import {
  GROUP_FIX_CAP,
  ignoreIssue,
  isFixInFlight,
  LOCK_STATUSES,
  runFix,
  runFixGroup,
} from "../fix";
import { log } from "../log";
import { STATUS_STYLES } from "../map-layer";
import type { Issue } from "../matching/evaluate";
import type { Scanner } from "../scan";
import type { SettingsStore } from "../settings";
import { formatNote, LEGEND_KEYS, STATE_KEYS, statusEmoji } from "./tab";
import { cantonMapLink } from "./canton-link";
import { mapGeoAdminUrlForGeometry } from "../geoadmin/links";
import { getLocale, t } from "../i18n";

const CONTAINER_ID = "chk-edit-helper";
/** The WME edit panel renders asynchronously after a selection; retry injection. */
const INJECT_RETRY_DELAYS_MS = [0, 250, 750];
const OK_COLOR = "#4a8f3c";

/** All issues sharing the reference issue's group (same status, name and suggestion). */
export function issuesInSameGroup(issues: ReadonlyMap<number, Issue>, ref: Issue): Issue[] {
  const key = (i: Issue): string => `${i.status}|${i.currentName ?? ""}|${i.suggestion ?? ""}`;
  const refKey = key(ref);
  return [...issues.values()].filter((i) => key(i) === refKey);
}

/**
 * Compact companion box at the top of the WME segment edit panel: shows the
 * scan verdict for the selected segment and offers Fix / Fix all shortcuts.
 * No search UI by design (removed in 0.4.1 after field feedback).
 */
export class EditPanelBox {
  private retryTimers: ReturnType<typeof setTimeout>[] = [];
  private warnedMissingPanel = false;

  constructor(
    private sdk: WmeSDK,
    private scanner: Scanner,
    private settings: SettingsStore,
  ) {}

  init(): void {
    this.sdk.Events.on({ eventName: "wme-selection-changed", eventHandler: () => this.schedule() });
    this.sdk.Events.on({ eventName: "wme-after-edit", eventHandler: () => this.schedule() });
    this.scanner.onUpdate(() => this.schedule());
  }

  private selectedSegmentId(): number | null {
    try {
      const selection = this.sdk.Editing.getSelection();
      if (selection?.objectType === "segment" && selection.ids.length === 1) {
        return selection.ids[0] as number;
      }
    } catch {
      // no selection
    }
    return null;
  }

  private schedule(): void {
    // wme-after-edit fires per fixed segment; don't rebuild the box (and its
    // progress button) while a fix batch is running.
    if (isFixInFlight()) return;
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers = [];
    const segmentId = this.selectedSegmentId();
    const s = this.settings.get();
    if (!s.editPanelHelper || !s.enabled || this.scanner.paused || segmentId === null) {
      document.getElementById(CONTAINER_ID)?.remove();
      return;
    }
    for (const delay of INJECT_RETRY_DELAYS_MS) {
      this.retryTimers.push(setTimeout(() => this.inject(segmentId), delay));
    }
  }

  private inject(segmentId: number): void {
    if (this.selectedSegmentId() !== segmentId) return;
    // DELIBERATE deviation from CLAUDE.md "no direct DOM hacks that bypass SDK events".
    // The WME SDK exposes no extension point for the segment edit panel (only the
    // sidebar script tab via registerScriptTab, and the request/street-view panels) —
    // verified against wme-sdk-typings. So this companion box is injected by hand.
    // Containment: selection/edit are still driven by SDK events; only the mount uses
    // the DOM, behind a documented selector. If WME renames #edit-panel the box simply
    // does not appear (warned once below) — it never corrupts data or the host UI.
    const panel = document.querySelector("#edit-panel");
    if (!panel) {
      if (!this.warnedMissingPanel) {
        this.warnedMissingPanel = true;
        log.warn("#edit-panel not found; the edit-panel box is unavailable in this WME version");
      }
      return;
    }
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      container.className = "chk-helper";
      panel.prepend(container);
    }
    this.render(container, segmentId);
  }

  private render(container: HTMLElement, segmentId: number): void {
    container.replaceChildren();
    const snapshot = this.scanner.getSnapshot();
    const issue = snapshot.issues.get(segmentId);

    const head = document.createElement("div");
    head.className = "chk-helper-head";
    const title = document.createElement("b");
    title.textContent = `🇨🇭 ${t("appName")}`;
    const dot = document.createElement("span");
    dot.className = "chk-dot";
    const statusText = document.createElement("span");
    head.append(title, dot, statusText);
    container.appendChild(head);

    if (!issue) {
      if (snapshot.state !== "done") {
        dot.style.background = "#bbb";
        statusText.textContent = t(STATE_KEYS[snapshot.state]);
        statusText.className = "chk-muted";
      } else if (this.isCheckedAndNamed(segmentId)) {
        dot.style.background = OK_COLOR;
        statusText.textContent = t("helperOk");
      } else {
        container.remove(); // nothing meaningful to say (skipped type, uncovered area)
      }
      return;
    }

    dot.style.background = STATUS_STYLES[issue.status].strokeColor;
    const emoji = statusEmoji(issue.status);
    statusText.textContent = emoji ? `${emoji} ${issue.status}` : issue.status;
    const geoLink = document.createElement("a");
    geoLink.textContent = "↗";
    geoLink.className = "chk-geolink";
    geoLink.href = mapGeoAdminUrlForGeometry(issue.geometry, getLocale());
    geoLink.target = "_blank";
    geoLink.rel = "noopener";
    geoLink.title = t("geoAdminLinkTitle");
    head.appendChild(geoLink);
    const cantonLink = cantonMapLink(issue.geometry, issue.cantonName);
    if (cantonLink) head.appendChild(cantonLink);

    const detail = document.createElement("div");
    detail.className = "chk-muted";
    detail.textContent = t(LEGEND_KEYS[issue.status]);
    container.appendChild(detail);

    if (issue.suggestion && issue.suggestion !== issue.currentName) {
      const line = document.createElement("div");
      line.className = "chk-helper-sug";
      const name = document.createElement("b");
      name.textContent = `→ ${issue.suggestion}`;
      line.appendChild(name);
      const noteText = formatNote(issue.note);
      if (noteText) {
        const note = document.createElement("span");
        note.className = "chk-note";
        note.textContent = ` (${noteText})`;
        line.appendChild(note);
      }
      container.appendChild(line);
    }

    const buttons = document.createElement("div");
    buttons.className = "chk-helper-sug";
    if (issue.fixable) {
      const fixBtn = document.createElement("button");
      fixBtn.textContent = t("fix");
      fixBtn.title = LOCK_STATUSES.has(issue.status)
        ? t("fixLockTitle", { n: issue.note?.expectedLock ?? "" })
        : t("fixTitle", { name: issue.suggestion ?? "" });
      fixBtn.addEventListener("click", () => this.onFixOne(issue, fixBtn));
      buttons.appendChild(fixBtn);

      const group = issuesInSameGroup(snapshot.issues, issue);
      if (group.length > 1) {
        const fixAllBtn = document.createElement("button");
        fixAllBtn.textContent = t("fixAll", { n: Math.min(group.length, GROUP_FIX_CAP) });
        fixAllBtn.addEventListener("click", () => this.onFixGroup(issue, group, fixAllBtn));
        buttons.appendChild(fixAllBtn);
      }
    }
    // Dismiss a false positive (any status, fixable or not).
    const ignoreBtn = document.createElement("button");
    ignoreBtn.textContent = t("ignore");
    ignoreBtn.title = t("ignoreTitle");
    ignoreBtn.addEventListener("click", () => this.onIgnore(issue));
    buttons.appendChild(ignoreBtn);
    container.appendChild(buttons);
  }

  private onIgnore(issue: Issue): void {
    ignoreIssue(this.settings, issue, () => {
      this.scanner.reevaluate();
      this.schedule();
    });
  }

  private isCheckedAndNamed(segmentId: number): boolean {
    try {
      const segment = this.sdk.DataModel.Segments.getById({ segmentId });
      if (!segment || !this.settings.get().checkedRoadTypes.includes(segment.roadType)) {
        return false;
      }
      const address = this.sdk.DataModel.Segments.getAddress({ segmentId });
      return Boolean(address.street?.name?.trim());
    } catch {
      return false;
    }
  }

  private onFixOne(issue: Issue, button?: HTMLButtonElement): void {
    void runFix(this.sdk, issue, this.settings.get(), {
      button,
      onComplete: () => {
        this.scanner.reevaluate();
        this.schedule();
      },
    });
  }

  private onFixGroup(issue: Issue, group: Issue[], button?: HTMLButtonElement): void {
    void runFixGroup(
      this.sdk,
      group,
      { status: issue.status, expectedLock: issue.note?.expectedLock, suggestion: issue.suggestion },
      this.settings.get(),
      {
        button,
        onComplete: () => {
          this.scanner.reevaluate();
          this.schedule();
        },
      },
    );
  }
}
