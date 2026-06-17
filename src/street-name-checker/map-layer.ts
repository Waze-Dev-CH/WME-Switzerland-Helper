import type { WmeSDK } from "wme-sdk-typings";
import { t } from "./i18n";
import type { Issue, IssueStatus } from "./matching/evaluate";
import type { SettingsStore } from "./settings";

let cachedLayerName: string | null = null;
/**
 * Localized layer name (no flag emoji — some layer menus render it poorly), captured once on
 * first use. The WME layer is registered with this string as its id and the checkbox-toggle
 * match compares against it, so it must stay stable even if the UI language changes
 * mid-session; a reload picks up the new language.
 */
export function getLayerName(): string {
  return (cachedLayerName ??= t("appName"));
}
const LABEL_MIN_ZOOM = 17;

interface StatusStyle {
  strokeColor: string;
  strokeDashstyle: "solid" | "dash";
}

export const STATUS_STYLES: Record<IssueStatus, StatusStyle> = {
  COSMETIC: { strokeColor: "#f7c948", strokeDashstyle: "dash" },
  VARIANT: { strokeColor: "#f7c948", strokeDashstyle: "solid" },
  NEAR: { strokeColor: "#ff8c00", strokeDashstyle: "solid" },
  WRONG_TYPE: { strokeColor: "#ff5722", strokeDashstyle: "dash" },
  BILINGUAL: { strokeColor: "#2e7d32", strokeDashstyle: "dash" },
  WRONG_STREET: { strokeColor: "#b71c1c", strokeDashstyle: "solid" },
  WRONG_CITY: { strokeColor: "#ff5ca8", strokeDashstyle: "solid" },
  NOT_FOUND: { strokeColor: "#e02020", strokeDashstyle: "solid" },
  UNNAMED: { strokeColor: "#9b59b6", strokeDashstyle: "dash" },
  UNNAMED_NO_MATCH: { strokeColor: "#9e9e9e", strokeDashstyle: "dash" },
  UNDER_LOCK: { strokeColor: "#c2185b", strokeDashstyle: "dash" },
  MICRO_SEGMENT: { strokeColor: "#00bcd4", strokeDashstyle: "solid" },
  LOOP: { strokeColor: "#795548", strokeDashstyle: "solid" },
  NARROW_MISUSE: { strokeColor: "#3f51b5", strokeDashstyle: "dash" },
  OVER_LOCK: { strokeColor: "#90a4ae", strokeDashstyle: "dash" },
};

function toFeature(issue: Issue) {
  return {
    type: "Feature" as const,
    id: `chk-${issue.segmentId}`,
    geometry: issue.geometry,
    properties: {
      status: issue.status,
      suggestion: issue.suggestion,
      currentName: issue.currentName,
    },
  };
}

export class HighlightLayer {
  /** featureId → rendered signature, so sync() only touches features that changed. */
  private rendered = new Map<string, string>();

  constructor(
    private sdk: WmeSDK,
    private settings: SettingsStore,
  ) {}

  init(): void {
    this.sdk.Map.addLayer({
      layerName: getLayerName(),
      styleContext: {
        getLabel: ({ feature, zoomLevel }) => {
          if (!this.settings.get().showMapLabels || zoomLevel < LABEL_MIN_ZOOM) return "";
          const suggestion = feature?.properties.suggestion;
          return typeof suggestion === "string" && suggestion !== "" ? `→ ${suggestion}` : "";
        },
      },
      styleRules: (Object.keys(STATUS_STYLES) as IssueStatus[]).map((status) => ({
        predicate: (properties) => properties.status === status,
        style: {
          strokeColor: STATUS_STYLES[status].strokeColor,
          strokeDashstyle: STATUS_STYLES[status].strokeDashstyle,
          strokeWidth: 6,
          strokeOpacity: 0.75,
          strokeLinecap: "round",
          pointerEvents: "none",
          label: "${getLabel}",
          fontColor: "#222222",
          fontSize: "12px",
          fontWeight: "bold",
          labelOutlineColor: "#ffffff",
          labelOutlineWidth: 3,
        },
      })),
    });
  }

  sync(issues: ReadonlyMap<number, Issue>): void {
    const layerName = getLayerName();
    // A single fix produces a new issues map that differs by one entry; rebuilding the
    // whole OpenLayers layer (removeAll + addAll) on every reevaluate churns hundreds of
    // features for nothing. Diff by featureId and touch only what actually changed.
    const next = new Map<string, { sig: string; feature: ReturnType<typeof toFeature> }>();
    for (const issue of issues.values()) {
      const feature = toFeature(issue);
      const sig = `${issue.status}|${issue.suggestion ?? ""}|${issue.currentName ?? ""}|${JSON.stringify(issue.geometry.coordinates)}`;
      next.set(feature.id, { sig, feature });
    }

    const featureIds: string[] = [];
    for (const [id, sig] of this.rendered) {
      if (next.get(id)?.sig !== sig) featureIds.push(id); // gone or changed
    }
    const features: Array<ReturnType<typeof toFeature>> = [];
    for (const [id, { sig, feature }] of next) {
      if (this.rendered.get(id) !== sig) features.push(feature); // new or changed
    }

    if (featureIds.length > 0) this.sdk.Map.removeFeaturesFromLayer({ layerName, featureIds });
    if (features.length > 0) this.sdk.Map.addFeaturesToLayer({ layerName, features });

    this.rendered = new Map([...next].map(([id, { sig }]) => [id, sig]));
  }

  setVisible(visible: boolean): void {
    this.sdk.Map.setLayerVisibility({ layerName: getLayerName(), visibility: visible });
  }
}

/** Layer-switcher checkbox controlling both layer visibility and scan pausing. */
export function registerLayerCheckbox(sdk: WmeSDK, onToggle: (checked: boolean) => void): void {
  sdk.LayerSwitcher.addLayerCheckbox({ name: getLayerName(), isChecked: true });
  sdk.Events.on({
    eventName: "wme-layer-checkbox-toggled",
    eventHandler: (payload) => {
      if (payload.name === getLayerName()) onToggle(payload.checked);
    },
  });
}
