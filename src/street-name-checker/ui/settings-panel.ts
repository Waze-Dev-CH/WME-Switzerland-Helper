import type { WmeSDK } from "wme-sdk-typings";
import {
  LANGUAGE_CHOICES,
  resolveLocale,
  setLocale,
  t,
  type LanguagePreference,
  type StringKey,
} from "../i18n";
import { STATUS_STYLES } from "../map-layer";
import type { Scanner } from "../scan";
import {
  ALL_STATUSES,
  ROAD_TYPE_OPTIONS,
  type CityScoping,
  type Settings,
  type SettingsStore,
} from "../settings";
import { buildSubsection, el, toggleSwitch } from "./dom";
import { LEGEND_KEYS } from "./format";

/**
 * What the settings panel needs from TabUI. Extracted from tab.ts, where 157 lines of
 * settings wiring sat next to the rendering and selection logic.
 */
export interface SettingsPanelContext {
  sdk: WmeSDK;
  settings: SettingsStore;
  scanner: Pick<Scanner, "requestScan" | "reevaluate">;
  /** Rebuilds the whole tab; the language selector needs it. */
  rebuild: () => void;
  /** Owned by TabUI: the switch is duplicated in the master row and both must track. */
  viewportOnlyToggle: () => HTMLElement;
}

export function buildSettingsPanel(ctx: SettingsPanelContext): HTMLElement {
  const details = el("details", "chk-section");
  const summary = el("summary");
  summary.append(el("span", "chk-section-icon", "⚙️"), el("span", "", t("settingsTitle")));
  details.appendChild(summary);
  const body = el("div", "chk-section-body");
  const settings = ctx.settings.get();

  const apply = (partial: Partial<Settings>, rescan = false): void => {
    ctx.settings.update(partial);
    if (rescan) ctx.scanner.requestScan();
    else ctx.scanner.reevaluate();
  };

  const grid = el("div", "chk-settings-grid");
  for (const option of ROAD_TYPE_OPTIONS) {
    const label = el("label");
    const cb = el("input") as HTMLInputElement;
    cb.type = "checkbox";
    cb.checked = settings.checkedRoadTypes.includes(option.id);
    cb.addEventListener("change", () => {
      const current = new Set(ctx.settings.get().checkedRoadTypes);
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
      const current = new Set(ctx.settings.get().enabledStatuses);
      if (cb.checked) current.add(status);
      else current.delete(status);
      ctx.settings.update({ enabledStatuses: ALL_STATUSES.filter((s) => current.has(s)) });
      ctx.scanner.reevaluate();
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
    toggleSwitch(
      t(textKey),
      settings[key],
      (checked) => apply({ [key]: checked }),
      titleKey ? t(titleKey) : undefined,
    );

  // second instance of the shared viewport-only toggle (see viewportOnlyToggle)
  const viewportToggle = ctx.viewportOnlyToggle();

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
    ctx.settings.update({ language });
    setLocale(resolveLocale(language, ctx.sdk.Settings.getLocale().localeCode));
    ctx.rebuild();
  });
  langRow.appendChild(langSelect);

  const ignoredRow = el("div", "chk-settings-row");
  ignoredRow.appendChild(el("span", "", t("ignoredCount", { n: settings.ignoredKeys.length })));
  const resetIgnoredBtn = el("button", "", t("resetIgnored")) as HTMLButtonElement;
  resetIgnoredBtn.disabled = settings.ignoredKeys.length === 0;
  resetIgnoredBtn.addEventListener("click", () => {
    ctx.settings.update({ ignoredKeys: [] });
    ctx.scanner.reevaluate();
    ctx.rebuild();
  });
  ignoredRow.appendChild(resetIgnoredBtn);

  body.append(
    buildSubsection("🛣️", t("roadTypesLabel"), [grid]),
    buildSubsection("🏷️", t("statusesLabel"), [statusGrid]),
    buildSubsection("🎛️", t("optionsLabel"), options),
    buildSubsection("📍", t("scopeDisplayLabel"), [scopingRow, zoomRow, langRow, ignoredRow]),
  );
  details.appendChild(body);
  return details;
}
