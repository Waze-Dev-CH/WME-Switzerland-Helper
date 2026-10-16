import type { WmeSDK } from "wme-sdk-typings";
import { groupScriptTab, tabLabelText } from "../../ui/tab-group";
import { applyThemeClass, watchTheme } from "../../ui/theme";
import type { Controller, Snapshot } from "../controller";
import { LANGUAGE_CHOICES, resolveLocale, setLocale, t, type LanguagePreference } from "../i18n";
import { log } from "../log";
import type { SettingsStore } from "../settings";
import type { PointStatus } from "../status";
import { buildSection, button, el, icon, numberInput, toggleSwitch } from "../../ui/dom";
import { STATUS_ICONS } from "../map-layer";
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
 * The status marker standing next to a label; never the sole carrier of a meaning, hence
 * the empty alt. It is the exact image the map draws, so a pill can never drift from the
 * point it stands for.
 *
 * Lives here rather than in the shared builders because it reads this feature's own
 * STATUS_ICONS, and rather than in ui/format.ts because that module holds no DOM.
 */
function dot(status: PointStatus): HTMLElement {
  const img = el("img", "hn-dot");
  img.src = STATUS_ICONS[status];
  img.alt = "";
  return img;
}

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
  /**
   * Checkbox of the single-import confirmation, realigned on every snapshot: the dialog's
   * "don't show again" box turns the setting off from outside the tab.
   */
  private confirmSingleInput: HTMLInputElement | null = null;

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
    brand.append(icon("home", "hn-brand-icon"), el("span", "hn-brand-title", t("appName")));

    // The master switch rides on the title line, as in the street-name tab.
    // Short label, like the street-name tab: the panel title beside it already says what
    // is being enabled. The full sentence stays as the tooltip.
    const enabledToggle = toggleSwitch(
      "hn",
      t("enable"),
      settings.enabled,
      (checked) => this.onEnabledChange(checked),
      t("enableTitle"),
    );
    enabledToggle.classList.add("hn-brand-switch");
    this.enabledInput = enabledToggle.querySelector("input");
    brand.appendChild(enabledToggle);

    this.banner.replaceChildren(this.bannerText);

    // Five blocks, matching the street-name tab one for one. `warning` is a sibling of the
    // banner rather than a face of it: a data caveat shows alongside the state, not
    // instead of it, and it stays hidden while empty.
    pane.append(
      brand,
      this.banner,
      this.warning,
      this.selection,
      this.actionRow,
      this.settingsSection(),
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

    if (this.confirmSingleInput)
      this.confirmSingleInput.checked = this.settings.get().confirmSingleImport;

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
        icon(verdict.className === "hn-verdict-ok" ? "checkmark" : "warning"),
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
        "hn-btn",
      ),
      button(t("btnClearCache"), () => void this.controller.reload(), "hn-btn"),
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

    const confirmSingleToggle = toggleSwitch(
      "hn",
      t("settingsConfirmSingle"),
      settings.confirmSingleImport,
      (confirmSingleImport) => this.settings.update({ confirmSingleImport }),
    );
    this.confirmSingleInput = confirmSingleToggle.querySelector("input");

    return buildSection("hn", "settings", t("settingsAndHelp"), [
      // What the feature is. It used to be the tab's second block, permanently on screen;
      // unlike the street-name checker, this feature has no note in the main sidebar, so
      // dropping it would leave a first-time editor with nothing explaining the tab.
      el("div", "hn-note", t("tabNote")),
      this.secondaryActions(),
      zoomRow,
      toggleSwitch("hn", t("settingsShowLabels"), settings.showMapLabels, (showMapLabels) => {
        this.settings.update({ showMapLabels });
        void this.controller.refresh();
      }),
      toggleSwitch("hn", t("settingsStrictMatch"), settings.strictMatching, (strictMatching) => {
        this.settings.update({ strictMatching });
        void this.controller.refresh();
      }),
      toggleSwitch(
        "hn",
        t("settingsExistingOnly"),
        settings.existingBuildingsOnly,
        (existingBuildingsOnly) => {
          this.settings.update({ existingBuildingsOnly });
          // The filter runs at parse time, so the cached tiles have to go.
          void this.controller.reload();
        },
      ),
      confirmSingleToggle,
      languageRow,
      // The pills carry the legend already, with a counter on top. This only covers the
      // statuses the current selection happens not to contain.
      el("div", "hn-note", t("legendNote")),
    ]);
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
