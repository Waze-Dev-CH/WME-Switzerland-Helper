import type { SdkFeature, WmeSDK } from "wme-sdk-typings";
import type { GwrPoint } from "./gwr/types";
import { t } from "./i18n";
import { log } from "./log";
import type { SettingsStore } from "./settings";
import type { PointStatus, StatusedPoint } from "./status";

let cachedLayerName: string | null = null;

/**
 * Localized layer name, captured once on first use. The layer is registered under this
 * string and the checkbox match compares against it, so it must stay stable even if the
 * UI language changes mid-session; a reload picks up the new language.
 */
export function getLayerName(): string {
  return (cachedLayerName ??= t("layerName"));
}

const LABEL_MIN_ZOOM = 18;

interface StatusStyle {
  fillColor: string;
  fillOpacity: number;
  pointRadius: number;
  clickable: boolean;
}

export const STATUS_STYLES: Record<PointStatus, StatusStyle> = {
  MISSING: { fillColor: "#2e7d32", fillOpacity: 0.95, pointRadius: 8, clickable: true },
  PRESENT: { fillColor: "#2e7d32", fillOpacity: 0.25, pointRadius: 5, clickable: false },
  OTHER_STREET: { fillColor: "#9e9e9e", fillOpacity: 0.55, pointRadius: 5, clickable: false },
  NEUTRAL: { fillColor: "#607d8b", fillOpacity: 0.55, pointRadius: 6, clickable: false },
};

const FEATURE_PREFIX = "hn-";

function toFeature(entry: StatusedPoint): SdkFeature {
  return {
    type: "Feature",
    id: `${FEATURE_PREFIX}${entry.point.id}`,
    geometry: { type: "Point", coordinates: [entry.point.lon, entry.point.lat] },
    properties: { status: entry.status, number: entry.point.number },
  };
}

export class AddressPointLayer {
  /** featureId -> rendered signature, so sync() only touches what changed. */
  private rendered = new Map<string, string>();
  /** featureId -> point, so a click can be resolved back to its address. */
  private points = new Map<string, GwrPoint>();

  constructor(
    private sdk: WmeSDK,
    private settings: SettingsStore,
  ) {}

  init(): void {
    try {
      this.sdk.Map.addLayer({
        layerName: getLayerName(),
        styleContext: {
          getLabel: ({ feature, zoomLevel }) => {
            if (!this.settings.get().showMapLabels || zoomLevel < LABEL_MIN_ZOOM) return "";
            const number = feature?.properties.number;
            return typeof number === "string" ? number : "";
          },
        },
        styleRules: (Object.keys(STATUS_STYLES) as PointStatus[]).map((status) => ({
          predicate: (properties) => properties.status === status,
          style: {
            graphicName: "circle",
            fillColor: STATUS_STYLES[status].fillColor,
            fillOpacity: STATUS_STYLES[status].fillOpacity,
            pointRadius: STATUS_STYLES[status].pointRadius,
            strokeColor: "#ffffff",
            strokeWidth: STATUS_STYLES[status].clickable ? 2 : 1,
            strokeOpacity: 0.9,
            // No pointerEvents:"none" here, unlike the checker's highlight layer: clicking
            // a point IS the feature. That one line is what the reference userscript had to
            // work around with its "press R, then click the map" dance.
            cursor: STATUS_STYLES[status].clickable ? "pointer" : "default",
            hoverPointRadius: STATUS_STYLES[status].pointRadius + 2,
            hoverFillOpacity: Math.min(1, STATUS_STYLES[status].fillOpacity + 0.2),
            label: "${getLabel}",
            fontColor: "#1b1d20",
            fontSize: "11px",
            fontWeight: "bold",
            labelOutlineColor: "#ffffff",
            labelOutlineWidth: 3,
            labelYOffset: -13,
          },
        })),
      });
      // Without this the layer never emits wme-layer-feature-clicked.
      this.sdk.Events.trackLayerEvents({ layerName: getLayerName() });
    } catch (err) {
      log.error("Could not create the map layer", err);
    }
  }

  /**
   * Push the current classification onto the map, touching only what changed. A change of
   * selection restyles a handful of points; rebuilding a thousand features on every click
   * would make the map crawl.
   */
  sync(entries: StatusedPoint[]): void {
    const layerName = getLayerName();
    const next = new Map<string, { signature: string; feature: SdkFeature; point: GwrPoint }>();
    for (const entry of entries) {
      const feature = toFeature(entry);
      const signature = `${entry.status}|${entry.point.number}|${entry.point.lon}|${entry.point.lat}`;
      next.set(String(feature.id), { signature, feature, point: entry.point });
    }

    const featureIds: string[] = [];
    for (const [id, signature] of this.rendered) {
      if (next.get(id)?.signature !== signature) featureIds.push(id); // gone or changed
    }
    const features: SdkFeature[] = [];
    for (const [id, entry] of next) {
      if (this.rendered.get(id) !== entry.signature) features.push(entry.feature);
    }

    try {
      if (featureIds.length > 0) this.sdk.Map.removeFeaturesFromLayer({ layerName, featureIds });
      if (features.length > 0) this.sdk.Map.addFeaturesToLayer({ layerName, features });
    } catch (err) {
      log.warn("Could not update the map layer", err);
      return;
    }

    this.rendered = new Map([...next].map(([id, entry]) => [id, entry.signature]));
    this.points = new Map([...next].map(([id, entry]) => [id, entry.point]));
  }

  /** The address behind a clicked feature, or null when it is not one of ours. */
  pointOf(featureId: string | number): GwrPoint | null {
    return this.points.get(String(featureId)) ?? null;
  }

  clear(): void {
    this.sync([]);
  }

  setVisible(visible: boolean): void {
    try {
      this.sdk.Map.setLayerVisibility({ layerName: getLayerName(), visibility: visible });
    } catch (err) {
      log.warn("Could not toggle the map layer", err);
    }
  }
}

/**
 * Layer-switcher checkbox controlling both visibility and fetching. `isChecked` comes from
 * the persisted settings: hardcoding it would tick the box back on after every reload.
 */
export function registerLayerCheckbox(
  sdk: WmeSDK,
  isChecked: boolean,
  onToggle: (checked: boolean) => void,
): void {
  sdk.LayerSwitcher.addLayerCheckbox({ name: getLayerName(), isChecked });
  sdk.Events.on({
    eventName: "wme-layer-checkbox-toggled",
    eventHandler: (payload) => {
      if (payload.name === getLayerName()) onToggle(payload.checked);
    },
  });
}

/** Realigns the checkbox after the feature was toggled from the tab instead. */
export function setLayerCheckbox(sdk: WmeSDK, isChecked: boolean): void {
  sdk.LayerSwitcher.setLayerCheckboxChecked({ name: getLayerName(), isChecked });
}
