import type { WmeSDK, ZoomLevel } from "wme-sdk-typings";
import { log } from "./log";

/**
 * Zoom at which a UR marker is comfortably clickable. Closer zooms are left alone: an
 * editor who is already zoomed in chose that view.
 */
export const FOCUS_ZOOM: ZoomLevel = 17;

/** Long enough to find the ring after the map has moved, short enough not to linger. */
export const HIGHLIGHT_MS = 4000;

const LAYER_NAME = "wme-ch-speed-camera-urs-focus";

export function focusZoom(current: ZoomLevel): ZoomLevel {
  return current < FOCUS_ZOOM ? FOCUS_ZOOM : current;
}

/**
 * Takes the editor to a UR from the list.
 *
 * The SDK cannot open a UR's panel: `Editing.setSelection` does not accept update requests
 * and `MapUpdateRequests` has no such method. So the next best thing is to put the marker
 * under the editor's cursor: centre, zoom until it is clickable, and ring it for a few
 * seconds. The ring lets clicks through, so the click lands on WME's own marker and opens
 * its panel.
 */
export class UrHighlight {
  private layerReady = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sdk: WmeSDK) {}

  init(): void {
    try {
      this.sdk.Map.addLayer({
        layerName: LAYER_NAME,
        styleRules: [
          {
            style: {
              pointRadius: 22,
              fillOpacity: 0,
              strokeColor: "#ff6d00",
              strokeWidth: 4,
              strokeOpacity: 0.9,
              pointerEvents: "none",
            },
          },
        ],
      });
      this.layerReady = true;
    } catch (err) {
      // Centring still works without the ring; only the visual cue is lost.
      log.warn("Could not create the focus layer", err);
    }
  }

  focus(position: { lon: number; lat: number }): void {
    try {
      const zoomLevel = focusZoom(this.sdk.Map.getZoomLevel());
      this.sdk.Map.setMapCenter({ lonLat: position, zoomLevel });
    } catch (err) {
      log.warn("Could not centre the map", err);
      return;
    }
    this.ring(position);
  }

  private ring(position: { lon: number; lat: number }): void {
    if (!this.layerReady) return;
    clearTimeout(this.timer);
    try {
      this.sdk.Map.removeAllFeaturesFromLayer({ layerName: LAYER_NAME });
      this.sdk.Map.addFeaturesToLayer({
        layerName: LAYER_NAME,
        features: [
          {
            type: "Feature",
            id: "focus",
            geometry: {
              type: "Point",
              coordinates: [position.lon, position.lat],
            },
          },
        ],
      });
    } catch (err) {
      log.warn("Could not draw the focus ring", err);
      return;
    }
    this.timer = setTimeout(() => this.clear(), HIGHLIGHT_MS);
  }

  private clear(): void {
    try {
      this.sdk.Map.removeAllFeaturesFromLayer({ layerName: LAYER_NAME });
    } catch {
      // The ring is decorative; a failed removal leaves it until the next focus.
    }
  }
}
