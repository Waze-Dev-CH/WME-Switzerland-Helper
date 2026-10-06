import type { WmeSDK } from "wme-sdk-typings";
import { buildSection, button, el, icon } from "../../ui/dom";
import { groupScriptTab, tabLabelText } from "../../ui/tab-group";
import { applyThemeClass, watchTheme } from "../../ui/theme";
import {
  canBatch,
  isCloseInFlight,
  runCloseAll,
  runCloseOne,
  runCloseTrafficLight,
  summarize,
  type CloseOutcome,
} from "../close";
import { getLocale, t } from "../i18n";
import { log } from "../log";
import type { UrHighlight } from "../map-highlight";
import type { Scanner, TrafficLightEntry, UrEntry } from "../scanner";
import {
  formatCloseAllButton,
  formatRowLabel,
  formatStatus,
  shouldShowCloseAll,
  splitEntries,
} from "./format";
import { injectStyles } from "./styles";

/** The title span of a section built by buildSection: the icon is an <i>, the title a <span>. */
function setSectionTitle(section: HTMLDetailsElement, text: string): void {
  const title = section.querySelector("summary span");
  if (title) title.textContent = text;
}

/**
 * The sidebar tab: state, last result, batch button, then the two lists, and the traffic
 * lights reported on a freeway, which have no batch at all.
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

  constructor(
    private sdk: WmeSDK,
    private scanner: Scanner,
    private highlight: UrHighlight,
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
      [el("div", "scu-note", t("trafficLightNote")), this.trafficLightList],
      true,
    );

    pane.append(
      brand,
      el("div", "scu-note", t("tabNote")),
      this.banner,
      this.result,
      this.actions,
      this.readySection,
      this.conversationSection,
      this.trafficLightSection,
    );
    this.tabPane.replaceChildren(pane);
  }

  private render(): void {
    if (
      !this.tabPane ||
      !this.readySection ||
      !this.conversationSection ||
      !this.trafficLightSection
    )
      return;
    const { entries, trafficLights } = this.scanner.getSnapshot();
    const lists = splitEntries(entries);
    this.bannerText.textContent = formatStatus(entries);

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
    this.trafficLightSection.hidden = trafficLights.length === 0;
    this.trafficLightList.replaceChildren(
      ...trafficLights.map((entry) => this.trafficLightRow(entry)),
    );
    setSectionTitle(
      this.trafficLightSection,
      t("sectionTrafficLights", { count: trafficLights.length }),
    );

    this.actions.replaceChildren();
    if (shouldShowCloseAll(canBatch(this.sdk), lists.ready.length)) {
      const ids = lists.ready.map((entry) => entry.id);
      const all = button(
        formatCloseAllButton(lists.ready.length),
        () => void this.handle(() => runCloseAll(this.sdk, ids)),
        "scu-btn scu-btn-primary",
      );
      all.disabled = isCloseInFlight();
      this.actions.appendChild(all);
    }
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
        void this.handle(() => runCloseTrafficLight(this.sdk, entry.id), {
          messagesSent: false,
        }),
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
    summary: { messagesSent?: boolean } = {},
  ): Promise<void> {
    const running = start();
    this.render();
    try {
      const outcome = await running;
      if (outcome) {
        this.result.textContent = summarize(
          Array.isArray(outcome) ? outcome : [outcome],
          summary,
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
