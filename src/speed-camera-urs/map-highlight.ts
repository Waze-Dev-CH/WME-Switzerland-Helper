import type { WmeSDK, ZoomLevel } from "wme-sdk-typings";
import { log } from "./log";

/**
 * Zoom at which a UR marker is comfortably clickable. Closer zooms are left alone: an
 * editor who is already zoomed in chose that view.
 */
export const FOCUS_ZOOM: ZoomLevel = 17;

/** Long enough to find the ring after the map has moved, short enough not to linger. */
export const HIGHLIGHT_MS = 4000;

/** One blink phase. Fast enough to catch the eye, slow enough not to strobe. */
export const BLINK_MS = 300;

const LAYER_NAME = "wme-ch-speed-camera-urs-focus";

type Phase = "a" | "b";

/**
 * Two looks that alternate. The ring changes colour and size rather than vanishing, so the
 * spot is never empty while the eye is searching for it. Fuchsia and yellow are absent from
 * WME's own palette, so neither blends into a road, an area or another marker.
 */
const PHASE_STYLES: Record<
  Phase,
  { strokeColor: string; pointRadius: number }
> = {
  a: { strokeColor: "#ff00ff", pointRadius: 24 },
  b: { strokeColor: "#ffea00", pointRadius: 32 },
};

export function focusZoom(current: ZoomLevel): ZoomLevel {
  return current < FOCUS_ZOOM ? FOCUS_ZOOM : current;
}

/**
 * Takes the editor to a UR from the list.
 *
 * The SDK cannot open a UR's panel: `Editing.setSelection` does not accept update requests
 * and `MapUpdateRequests` has no such method. So the next best thing is to put the marker
 * under the editor's cursor: centre, zoom until it is clickable, and make a ring blink
 * around it for a few seconds. The ring lets clicks through, so the click lands on WME's
 * own marker and opens its panel.
 */
export class UrHighlight {
  private layerReady = false;
  private blinkTimer: ReturnType<typeof setInterval> | undefined;
  private endTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sdk: WmeSDK) {}

  init(): void {
    try {
      this.sdk.Map.addLayer({
        layerName: LAYER_NAME,
        styleRules: (Object.keys(PHASE_STYLES) as Phase[]).map((phase) => ({
          predicate: (properties) => properties.phase === phase,
          style: {
            ...PHASE_STYLES[phase],
            fillOpacity: 0,
            strokeWidth: 7,
            strokeOpacity: 1,
            pointerEvents: "none",
          },
        })),
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
    this.blink(position);
  }

  private blink(position: { lon: number; lat: number }): void {
    if (!this.layerReady) return;
    // A new click takes over: the previous ring's timers must neither keep drawing it nor
    // erase the new one early.
    this.stop();
    let phase: Phase = "a";
    if (!this.draw(position, phase)) return;
    this.blinkTimer = setInterval(() => {
      phase = phase === "a" ? "b" : "a";
      if (!this.draw(position, phase)) this.stop();
    }, BLINK_MS);
    this.endTimer = setTimeout(() => {
      this.stop();
      this.clear();
    }, HIGHLIGHT_MS);
  }

  /** The SDK cannot restyle a feature in place, so each phase replaces it. */
  private draw(position: { lon: number; lat: number }, phase: Phase): boolean {
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
            properties: { phase },
          },
        ],
      });
      return true;
    } catch (err) {
      log.warn("Could not draw the focus ring", err);
      return false;
    }
  }

  private stop(): void {
    clearInterval(this.blinkTimer);
    clearTimeout(this.endTimer);
  }

  private clear(): void {
    try {
      this.sdk.Map.removeAllFeaturesFromLayer({ layerName: LAYER_NAME });
    } catch {
      // The ring is decorative; a failed removal leaves it until the next focus.
    }
  }
}
