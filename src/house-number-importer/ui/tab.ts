import type { WmeSDK } from "wme-sdk-typings";
import { groupScriptTab, tabLabelText } from "../../ui/tab-group";
import { applyThemeClass, watchTheme } from "../../ui/theme";
import type { Controller, Snapshot } from "../controller";
import { LANGUAGE_CHOICES, resolveLocale, setLocale, t, type LanguagePreference } from "../i18n";
import { log } from "../log";
import type { SettingsStore } from "../settings";
import type { PointStatus } from "../status";
import { buildSection, button, dot, el, numberInput, toggleSwitch } from "./dom";
import { getStreetNameVerdict } from "../../street-check-bridge";
import {
  canBulkImport,
  countByStatus,
  dataWarning,
  formatImportButton,
  formatState,
  formatVerdict,
  LEGEND_KEYS,
} from "./format";
import { injectStyles } from "./styles";

const MIN_ZOOM_BOUNDS = { min: 15, max: 22 };
/** Statuses worth counting in the tab; NEUTRAL is the absence of a verdict, not a count. */
const COUNTED: PointStatus[] = ["MISSING", "PRESENT", "OTHER_STREET"];

/**
 * The dedicated sidebar tab: master switch, state, counts, bulk import, settings, legend.
 *
 * It is a configuration and summary panel, consulted before and after the work rather than
 * during it; the action that must stay reachable while a segment is selected lives in the
 * edit-panel box instead.
 *
 * The skeleton is built once and only the live parts are rewritten on each snapshot. A
 * full rebuild would close the Settings section and reset the scroll every time the map
 * moves, which is precisely when the editor is not looking at the tab.
 */
export class TabUI {
  private tabPane: HTMLElement | null = null;
  private tabLabel: HTMLElement | null = null;
  /** Checkbox of the master toggle, realigned when the layer checkbox changes the state. */
  private enabledInput: HTMLInputElement | null = null;

  private banner = el("div", "hn-banner");
  private bannerText = el("span", "hn-banner-text");
  private selection = el("div", "hn-selection");
  private actionRow = el("div", "hn-actions");
  private warning = el("div", "hn-warn");

  constructor(
    private sdk: WmeSDK,
    private controller: Controller,
    private settings: SettingsStore,
    private onEnabledChange: (enabled: boolean) => void,
  ) {}

  async init(): Promise<void> {
    injectStyles();
    try {
      const { tabLabel, tabPane } = await this.sdk.Sidebar.registerScriptTab();
      this.tabLabel = tabLabel;
      this.tabPane = tabPane;
      this.refreshLabel();
      groupScriptTab(tabLabel, tabPane, "house-numbers");
    } catch (err) {
      log.error("Could not register the sidebar tab", err);
      return;
    }
    applyThemeClass(this.tabPane);
    watchTheme(this.tabPane);
    this.buildSkeleton();
    this.controller.onUpdate((snapshot) => this.render(snapshot));
    this.render(this.controller.getSnapshot());
  }

  /**
   * Realign the master toggle after the layer checkbox or the shortcut changed the state.
   * Without it the toggle keeps showing the old value, and its next click sets what is
   * already in force, which reads as a dead control.
   */
  syncEnabledToggle(checked: boolean): void {
    if (this.enabledInput) this.enabledInput.checked = checked;
  }

  /** Rebuilt only when the language changes, which relabels everything at once. */
  private buildSkeleton(): void {
    if (!this.tabPane) return;
    const settings = this.settings.get();
    const pane = el("div", "hn-pane");

    const brand = el("div", "hn-brand");
    brand.append(el("span", "hn-brand-icon", "🏠"), el("span", "hn-brand-title", t("appName")));

    this.banner.replaceChildren(this.bannerText);
    const master = el("div", "hn-master");
    const enabledToggle = toggleSwitch(t("enable"), settings.enabled, (checked) =>
      this.onEnabledChange(checked),
    );
    this.enabledInput = enabledToggle.querySelector("input");
    master.appendChild(enabledToggle);

    pane.append(
      brand,
      el("div", "hn-note", t("tabNote")),
      this.banner,
      master,
      this.warning,
      this.selection,
      this.actionRow,
      this.secondaryActions(),
      this.settingsSection(),
      this.legendSection(),
    );
    this.tabPane.replaceChildren(pane);
  }

  private render(snapshot: Snapshot): void {
    if (!this.tabPane) return;
    const enabled = this.settings.get().enabled;

    const warning = dataWarning(snapshot);

    this.bannerText.textContent = formatState(snapshot);
    this.banner.className = "hn-banner";
    if (snapshot.state === "error") this.banner.classList.add("hn-banner-error");
    else if (
      enabled &&
      snapshot.segmentId !== null &&
      snapshot.missing.length === 0 &&
      // "Nothing missing" over data that does not cover the view is a claim we cannot make.
      warning === null
    ) {
      this.banner.classList.add("hn-banner-ok");
    }

    this.warning.textContent = warning ?? "";
    this.warning.hidden = warning === null || !enabled;

    this.renderSelection(snapshot, enabled);
    this.renderAction(snapshot, enabled);
  }

  private renderSelection(snapshot: Snapshot, enabled: boolean): void {
    if (!enabled) {
      this.selection.replaceChildren();
      return;
    }
    if (snapshot.segmentId === null) {
      this.selection.replaceChildren(el("div", "hn-note", t("hintSelectSegment")));
      return;
    }

    const counts = countByStatus(snapshot.points);
    const values: Record<PointStatus, number> = {
      MISSING: counts.missing,
      PRESENT: counts.present,
      OTHER_STREET: counts.otherStreet,
      NEUTRAL: 0,
    };
    const pills = el("div", "hn-pills");
    for (const status of COUNTED) {
      const pill = el("span", "hn-pill");
      pill.append(
        dot(status),
        el("span", "hn-pill-value", String(values[status])),
        el("span", "", t(LEGEND_KEYS[status])),
      );
      pills.appendChild(pill);
    }

    const children: HTMLElement[] = [el("div", "hn-street", snapshot.streetName || "?")];

    // What the street-name checker knows about this name, when it knows anything at all.
    const verdict = formatVerdict(getStreetNameVerdict(snapshot.segmentId));
    if (verdict) {
      const line = el("div", `hn-verdict ${verdict.className}`);
      line.append(
        el("span", "", verdict.className === "hn-verdict-ok" ? "✓" : "⚠️"),
        el("span", "", verdict.text),
      );
      children.push(line);
    }

    children.push(pills);
    this.selection.replaceChildren(...children);
  }

  /** Hidden, not disabled, when it does not apply: a greyed button still invites the click. */
  private renderAction(snapshot: Snapshot, enabled: boolean): void {
    if (!enabled || !canBulkImport(snapshot)) {
      this.actionRow.replaceChildren();
      return;
    }
    this.actionRow.replaceChildren(
      button(
        formatImportButton(snapshot.missing.length),
        () => void this.controller.importMissing(),
        "hn-btn hn-btn-primary",
      ),
    );
  }

  private secondaryActions(): HTMLElement {
    const row = el("div", "hn-actions");
    row.append(
      button(
        t("btnRefreshExisting"),
        () => void this.controller.refresh({ refetchExisting: true }),
      ),
      button(t("btnClearCache"), () => void this.controller.reload()),
    );
    return row;
  }

  private settingsSection(): HTMLElement {
    const settings = this.settings.get();

    const zoomRow = el("div", "hn-row");
    zoomRow.append(
      el("span", "", t("settingsMinZoom")),
      numberInput(
        settings.minZoom,
        (minZoom) => {
          this.settings.update({ minZoom });
          void this.controller.refresh();
        },
        MIN_ZOOM_BOUNDS,
      ),
    );

    const languageRow = el("div", "hn-row");
    const select = el("select") as HTMLSelectElement;
    for (const choice of LANGUAGE_CHOICES) {
      const option = el("option", "", choice.label) as HTMLOptionElement;
      option.value = choice.value;
      option.selected = choice.value === settings.language;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      const language = select.value as LanguagePreference;
      this.settings.update({ language });
      setLocale(resolveLocale(language, this.sdk.Settings.getLocale().localeCode));
      // Every label changes at once, so this is the one case worth a full rebuild.
      this.refreshLabel();
      this.buildSkeleton();
      this.render(this.controller.getSnapshot());
    });
    languageRow.append(el("span", "", t("settingsLanguage")), select);

    return buildSection("⚙️", t("settingsTitle"), [
      zoomRow,
      toggleSwitch(t("settingsShowLabels"), settings.showMapLabels, (showMapLabels) => {
        this.settings.update({ showMapLabels });
        void this.controller.refresh();
      }),
      toggleSwitch(t("settingsStrictMatch"), settings.strictMatching, (strictMatching) => {
        this.settings.update({ strictMatching });
        void this.controller.refresh();
      }),
      toggleSwitch(
        t("settingsExistingOnly"),
        settings.existingBuildingsOnly,
        (existingBuildingsOnly) => {
          this.settings.update({ existingBuildingsOnly });
          // The filter runs at parse time, so the cached tiles have to go.
          void this.controller.reload();
        },
      ),
      toggleSwitch(
        t("settingsConfirmSingle"),
        settings.confirmSingleImport,
        (confirmSingleImport) => this.settings.update({ confirmSingleImport }),
      ),
      languageRow,
    ]);
  }

  private legendSection(): HTMLElement {
    const legend = el("div", "hn-legend");
    for (const status of Object.keys(LEGEND_KEYS) as PointStatus[]) {
      const row = el("div", "hn-legend-row");
      row.append(dot(status), el("span", "", t(LEGEND_KEYS[status])));
      legend.appendChild(row);
    }
    // Open by default: it is four lines, and it is what makes the map readable at a glance.
    return buildSection("🎨", t("legendTitle"), [legend], true);
  }

  /**
   * The Scripts-bar label, prefixed so it reads as part of this script rather than as a
   * standalone one. The emoji stays in the panel header, where it identifies the feature
   * without crowding a bar shared with every other userscript.
   */
  private refreshLabel(): void {
    if (this.tabLabel) this.tabLabel.textContent = tabLabelText(t("tabTitle"));
  }
}
