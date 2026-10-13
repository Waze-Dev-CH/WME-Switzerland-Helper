import type { WmeSDK } from "wme-sdk-typings";
import { buildSection, button, el, icon } from "../../ui/dom";
import { groupScriptTab, tabLabelText } from "../../ui/tab-group";
import { applyThemeClass, watchTheme } from "../../ui/theme";
import {
  canBatch,
  canBatchStale,
  isCloseInFlight,
  runAskMapMate,
  runCloseOne,
  runCloseSelected,
  runCloseStale,
  runCloseTrafficLight,
  summarize,
  summarizeBatch,
  type CloseOutcome,
} from "../close";
import { STALE_AGE_DAYS } from "../detect";
import { getLocale, t } from "../i18n";
import { log } from "../log";
import type { UrHighlight } from "../map-highlight";
import type {
  Scanner,
  StaleEntry,
  MapMateEntry,
  TrafficLightEntry,
  UrEntry,
} from "../scanner";
import { saveSettings, type Criteria, type Settings } from "../settings";
import {
  formatCloseSelectedButton,
  formatMapMateRowLabel,
  formatRowLabel,
  formatStaleRowLabel,
  formatStatus,
  selectedBatch,
  shouldShowCloseSelected,
  splitEntries,
} from "./format";
import { criterionCheckbox } from "./criteria";
import { injectStyles } from "./styles";

/** The title span of a section built by buildSection: the icon is an <i>, the title a <span>. */
function setSectionTitle(section: HTMLDetailsElement, text: string): void {
  const title = section.querySelector("summary span");
  if (title) title.textContent = text;
}

/**
 * The sidebar tab: state, the families to handle, last result, the single batch button,
 * then one section per family. Traffic lights on a freeway are never in the batch.
 *
 * The skeleton is built once and only the live parts are rewritten, so the editor's
 * expand/collapse of a section survives the rescans that every map move triggers.
 */
export class TabUI {
  private tabPane: HTMLElement | null = null;
  private banner = el("div", "scu-banner");
  private bannerText = el("span", "scu-banner-text");
  private result = el("div", "scu-warn");
  private actions = el("div", "scu-actions");
  private readyList = el("div", "scu-list");
  private conversationList = el("div", "scu-list");
  private readySection: HTMLDetailsElement | null = null;
  private conversationSection: HTMLDetailsElement | null = null;
  private trafficLightList = el("div", "scu-list");
  private trafficLightSection: HTMLDetailsElement | null = null;
  private criteria = el("div", "scu-criteria");
  private staleList = el("div", "scu-list");
  private staleSection: HTMLDetailsElement | null = null;
  private mapMateList = el("div", "scu-list");
  private mapMateSection: HTMLDetailsElement | null = null;

  constructor(
    private sdk: WmeSDK,
    private scanner: Scanner,
    private highlight: UrHighlight,
    private settings: Settings,
  ) {}

  async init(): Promise<void> {
    injectStyles();
    try {
      const { tabLabel, tabPane } = await this.sdk.Sidebar.registerScriptTab();
      this.tabPane = tabPane;
      tabLabel.textContent = tabLabelText(t("tabName"));
      groupScriptTab(tabLabel, tabPane, "speed-camera-urs");
    } catch (err) {
      log.error("Could not register the sidebar tab", err);
      return;
    }
    applyThemeClass(this.tabPane);
    watchTheme(this.tabPane);
    this.buildSkeleton();
    this.scanner.onUpdate(() => this.render());
    this.render();
  }

  private buildSkeleton(): void {
    if (!this.tabPane) return;
    const pane = el("div", "scu-pane");

    const brand = el("div", "scu-brand");
    brand.append(
      icon("warning", "scu-brand-icon"),
      el("span", "scu-brand-title", t("appName")),
    );

    this.banner.replaceChildren(this.bannerText);
    this.result.hidden = true;
    this.readySection = buildSection(
      "scu",
      "location",
      t("sectionReady", { count: 0 }),
      [this.readyList],
      true,
    );
    this.conversationSection = buildSection(
      "scu",
      "warning",
      t("sectionConversation", { count: 0 }),
      [el("div", "scu-note", t("conversationNote")), this.conversationList],
    );
    this.trafficLightSection = buildSection(
      "scu",
      "warning",
      t("sectionTrafficLights", { count: 0 }),
      [this.trafficLightList],
      true,
    );

    this.mapMateSection = buildSection(
      "scu",
      "warning",
      t("sectionMapMate", { count: 0 }),
      [this.mapMateList],
      true,
    );
    this.buildCriteria();
    this.staleSection = buildSection(
      "scu",
      "warning",
      t("sectionStale", { count: 0 }),
      [this.staleList],
      true,
    );

    pane.append(
      brand,
      el("div", "scu-note", t("tabNote")),
      this.banner,
      this.criteria,
      this.result,
      this.actions,
      this.readySection,
      this.conversationSection,
      this.trafficLightSection,
      this.mapMateSection,
      this.staleSection,
    );
    this.tabPane.replaceChildren(pane);
  }

  private buildCriteria(): void {
    const toggle = (key: keyof Criteria) => (checked: boolean) =>
      this.setCriterion(key, checked);
    const current = this.settings.criteria;
    this.criteria.replaceChildren(
      el("div", "scu-criteria-label", t("criteriaLabel")),
      criterionCheckbox(
        t("criterionSpeedCamera"),
        t("speedCameraInfo"),
        current.speedCamera,
        toggle("speedCamera"),
      ),
      criterionCheckbox(
        t("criterionTrafficLight"),
        t("trafficLightInfo"),
        current.trafficLight,
        toggle("trafficLight"),
      ),
      criterionCheckbox(
        t("criterionMapMate"),
        t("mapMateInfo"),
        current.mapMate,
        toggle("mapMate"),
      ),
      criterionCheckbox(
        t("criterionStale", { days: STALE_AGE_DAYS }),
        t("staleInfo", { days: STALE_AGE_DAYS }),
        current.stale,
        toggle("stale"),
      ),
    );
  }

  /** Unchecking a family that reads conversations stops the reads from the next scan; cached verdicts stay. */
  private setCriterion(key: keyof Criteria, checked: boolean): void {
    this.settings = {
      ...this.settings,
      criteria: { ...this.settings.criteria, [key]: checked },
    };
    saveSettings(this.settings);
    this.scanner.setReadStale(this.settings.criteria.stale);
    this.scanner.setReadMapMate(this.settings.criteria.mapMate);
    this.scanner.schedule();
    this.render();
  }

  private render(): void {
    if (
      !this.tabPane ||
      !this.readySection ||
      !this.conversationSection ||
      !this.trafficLightSection ||
      !this.mapMateSection ||
      !this.staleSection
    )
      return;
    const criteria = this.settings.criteria;
    const snapshot = this.scanner.getSnapshot();
    const { entries, trafficLights, mapMate, stale } = snapshot;
    const lists = splitEntries(entries);
    this.bannerText.textContent = formatStatus(snapshot, criteria);

    this.readySection.hidden = !criteria.speedCamera;
    this.conversationSection.hidden = !criteria.speedCamera;
    // Pending URs sit with the ready ones, without a button until their conversation is read.
    const readyRows = [...lists.ready, ...lists.pending].map((entry) =>
      this.row(entry),
    );
    this.readyList.replaceChildren(...readyRows);
    this.conversationList.replaceChildren(
      ...lists.conversation.map((entry) => this.row(entry)),
    );
    setSectionTitle(
      this.readySection,
      t("sectionReady", { count: lists.ready.length + lists.pending.length }),
    );
    setSectionTitle(
      this.conversationSection,
      t("sectionConversation", { count: lists.conversation.length }),
    );

    // Hidden while empty: most of the map has none, and an empty box would only add noise.
    this.trafficLightSection.hidden =
      !criteria.trafficLight || trafficLights.length === 0;
    this.trafficLightList.replaceChildren(
      ...trafficLights.map((entry) => this.trafficLightRow(entry)),
    );
    setSectionTitle(
      this.trafficLightSection,
      t("sectionTrafficLights", { count: trafficLights.length }),
    );

    this.mapMateSection.hidden = !criteria.mapMate;
    this.mapMateList.replaceChildren(
      ...mapMate.map((entry) => this.mapMateRow(entry)),
    );
    setSectionTitle(
      this.mapMateSection,
      t("sectionMapMate", { count: mapMate.length }),
    );

    this.staleSection.hidden = !criteria.stale;
    const now = Date.now();
    this.staleList.replaceChildren(
      ...stale.map((entry) => this.staleRow(entry, now)),
    );
    setSectionTitle(
      this.staleSection,
      t("sectionStale", { count: stale.length }),
    );

    const level3 = canBatch(this.sdk);
    const batch = selectedBatch(
      criteria,
      { speedCamera: level3, mapMate: level3, stale: canBatchStale(this.sdk) },
      {
        speedCamera: lists.ready.map((entry) => entry.id),
        mapMate: mapMate
          .filter((entry) => entry.state === "ready")
          .map((entry) => entry.id),
        stale: stale
          .filter((entry) => entry.state === "stale")
          .map((entry) => entry.id),
      },
    );
    const total =
      batch.speedCamera.length + batch.mapMate.length + batch.stale.length;
    this.actions.replaceChildren();
    if (!shouldShowCloseSelected(total)) return;
    const all = button(
      formatCloseSelectedButton(total),
      () =>
        void this.handle(
          () => runCloseSelected(this.sdk, batch),
          (outcomes) => summarizeBatch(outcomes, batch.speedCamera),
        ),
      "scu-btn scu-btn-primary",
    );
    all.disabled = isCloseInFlight();
    this.actions.appendChild(all);
  }

  private rowWithLabel(entry: TrafficLightEntry): HTMLElement {
    const row = el("div", "scu-row");
    const label = button(
      formatRowLabel(entry, getLocale()),
      () => this.highlight.focus(entry),
      "scu-plain scu-row-label",
    );
    label.title = t("rowTitle");
    row.appendChild(label);
    return row;
  }

  private trafficLightRow(entry: TrafficLightEntry): HTMLElement {
    const row = this.rowWithLabel(entry);
    const action = button(
      t("btnCloseTrafficLight"),
      () =>
        void this.handle(
          () => runCloseTrafficLight(this.sdk, entry.id),
          (outcomes) => summarize(outcomes, { messagesSent: false }),
        ),
      "scu-btn",
    );
    action.disabled = isCloseInFlight();
    row.appendChild(action);
    return row;
  }

  private mapMateRow(entry: MapMateEntry): HTMLElement {
    const row = el("div", "scu-row");
    const label = button(
      formatMapMateRowLabel(entry, getLocale()),
      () => this.highlight.focus(entry),
      "scu-plain scu-row-label",
    );
    label.title = t("rowTitle");
    row.appendChild(label);

    if (entry.state === "pending") {
      row.appendChild(el("span", "scu-muted", t("rowPending")));
      return row;
    }
    const action = button(
      t("btnAskMapMate"),
      () => void this.handle(() => runAskMapMate(this.sdk, entry.id)),
      "scu-btn",
    );
    action.disabled = isCloseInFlight();
    row.appendChild(action);
    return row;
  }

  private staleRow(entry: StaleEntry, now: number): HTMLElement {
    const row = el("div", "scu-row");
    const label = button(
      formatStaleRowLabel(entry, getLocale(), now),
      () => this.highlight.focus(entry),
      "scu-plain scu-row-label",
    );
    label.title = t("rowTitle");
    row.appendChild(label);

    if (entry.state === "pending") {
      row.appendChild(el("span", "scu-muted", t("rowPending")));
      return row;
    }
    const action = button(
      t("btnCloseStale"),
      () =>
        void this.handle(
          () => runCloseStale(this.sdk, entry.id),
          (outcomes) => summarize(outcomes, { messagesSent: false }),
        ),
      "scu-btn",
    );
    action.disabled = isCloseInFlight();
    row.appendChild(action);
    return row;
  }

  private row(entry: UrEntry): HTMLElement {
    const row = this.rowWithLabel(entry);

    if (entry.triage === "pending") {
      row.appendChild(el("span", "scu-muted", t("rowPending")));
      return row;
    }
    const action = button(
      t("btnCloseOne"),
      () => void this.handle(() => runCloseOne(this.sdk, entry.id)),
      "scu-btn",
    );
    action.disabled = isCloseInFlight();
    row.appendChild(action);
    return row;
  }

  /**
   * Runs a flow and shows its result. The flow takes its lock synchronously, so rendering
   * right after starting it already greys every button for the duration.
   */
  private async handle(
    start: () => Promise<CloseOutcome | CloseOutcome[] | null>,
    describe: (outcomes: CloseOutcome[]) => string = (outcomes) =>
      summarize(outcomes),
  ): Promise<void> {
    const running = start();
    this.render();
    try {
      const outcome = await running;
      if (outcome) {
        this.result.textContent = describe(
          Array.isArray(outcome) ? outcome : [outcome],
        );
        this.result.hidden = false;
      }
    } catch (err) {
      log.error("A close flow failed", err);
    } finally {
      this.scanner.schedule();
      this.render();
    }
  }
}
