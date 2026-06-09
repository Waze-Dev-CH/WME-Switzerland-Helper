/*
 * Copyright (c) 2025 Maël Pedretti
 *
 * This file is part of WME Switzerland Helper.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  WmeSDK,
  VenueCategoryId,
  SdkFeature,
  SdkFeatureStyleRule,
  SdkFeatureStyleContext,
} from "wme-sdk-typings";
import { point } from "@turf/turf";
import { SBBDataFetcher, SBBRecord } from "./sbbDataLayer";
import { FeatureLayer } from "./featureLayer";
import { showWmeDialog, waitForMapIdle } from "./utils";
import { StopGeometry } from "./stopGeometry";
import { StopNameFormatter } from "./stopNameFormatter";
import { VenueMatcher, type VenueLike } from "./venueMatcher";
import { WazeVenueFetcher, TRANSPORT_CATEGORIES } from "./wazeVenueFetcher";
import { ClusterManager, type ClusterGroup } from "./clusterManager";
import i18next from "../locales/i18n";

interface TransportStop extends SBBRecord {
  meansoftransport: string;
  designationofficial?: string;
  designation?: string;
  municipalityname: string;
  businessorganisationabbreviationde: string;
  businessorganisationdescriptionde: string;
  lat?: number;
  lon?: number;
}

type FeatureKind =
  | "sbb-stop"
  | "obsolete-venue"
  | "cluster-sbb"
  | "cluster-obsolete";

interface ClusterDisplayData {
  bbox: [number, number, number, number];
  count: number;
  itemIds: string[];
  svgDataUrl: string;
}

interface DesiredFeature {
  id: string;
  sdkFeature: SdkFeature;
  kind: FeatureKind;
  record: unknown;
  clusterDisplayData?: ClusterDisplayData;
}

const ORANGE_COLOR = "#e67e22";
const RED_COLOR = "#e74c3c";

const BUS_PATH =
  "M29.726 14a3 3 0 0 1 2.995 2.824l.005.176v1h1.017l.15.005c.938.06 1.76.684 1.843 1.591l.007.154V22l-.007.117a1 1 0 0 1-.876.876l-.117.007-.117-.007a1 1 0 0 1-.876-.876L33.743 22v-2h-1.017v10a1 1 0 0 1-.883.993l-.117.007h-1v1.5a1.5 1.5 0 0 1-3 0V31h-6v1.5a1.5 1.5 0 0 1-3 0V31h-1a1 1 0 0 1-.993-.883L16.726 30V20h-1v2a1 1 0 0 1-.883.993l-.117.007a1 1 0 0 1-.993-.883L13.726 22v-2.25c0-.99.86-1.682 1.85-1.745l.15-.005h1v-1a3 3 0 0 1 2.824-2.995l.176-.005zm-1 13h-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2m-7 0h-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2m-.429-11h-1.57l-.117.007a1 1 0 0 0-.877.876l-.007.117v8h12v-8l-.007-.117a1 1 0 0 0-.764-.857l-.112-.02-.117-.006h-1.572l-.854 1.496-.065.1a1 1 0 0 1-.803.404H23.02l-.119-.007a1 1 0 0 1-.75-.497z";

function generateStopSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="49" height="48" fill="black"><circle cx="24.726" cy="24" r="23" fill="${color}" stroke="#fff" stroke-width="2"/><path fill="#fff" d="${BUS_PATH}"/><script xmlns=""/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function generateClusterSvg(color: string, count: number): string {
  const label = count > 99 ? "99+" : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="${color}" stroke="#fff" stroke-width="2"/><text x="20" y="25" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff" font-family="Arial,sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const ORANGE_STOP_SVG = generateStopSvg(ORANGE_COLOR);
const RED_STOP_SVG = generateStopSvg(RED_COLOR);

// Number of records processed between yields to the event loop during the
// O(stops × venues) matching, so the map stays interactive on large viewports.
const MATCH_CHUNK_SIZE = 100;

// Venue categories that must never be marked obsolete: the SBB stop dataset is
// not authoritative for ports/marinas/harbors (e.g. pleasure ports).
const OBSOLETE_EXEMPT_CATEGORIES = ["SEAPORT_MARINA_HARBOR"];

// Venues can be added/edited from zoom 16 (WME's minimum editable zoom) now that
// venue data comes from the Waze API rather than the SDK's zoom-17 data load.
const ADD_VENUE_MIN_ZOOM = 16;
// When a stop is clicked below that zoom, recenter and zoom in to this level.
const ADD_VENUE_ZOOM_IN_LEVEL = 17;

// Yields control to the browser so it can repaint/handle input between chunks.
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface PublicTransportStopsLayerConstructorArgs {
  name: string;
}

class PublicTransportStopsLayer extends FeatureLayer {
  private readonly dataFetcher: SBBDataFetcher;
  private readonly stopGeometry: StopGeometry;
  private readonly nameFormatter: StopNameFormatter;
  private readonly venueMatcher: VenueMatcher;
  private readonly wazeVenueFetcher: WazeVenueFetcher;
  private readonly clusterManager: ClusterManager;
  private readonly featureKinds: Map<string, FeatureKind>;
  private readonly clusterData: Map<string, ClusterDisplayData>;
  // Monotonic token: every render() call bumps it and captures its own value.
  // After each await, a render whose token is stale (a newer render started)
  // bails out, so a fresh map move effectively cancels the in-flight render.
  private renderGeneration = 0;

  constructor(
    args: PublicTransportStopsLayerConstructorArgs & { wmeSDK: WmeSDK },
  ) {
    super({ ...args, wmeSDK: args.wmeSDK, minZoomLevel: 13 });
    this.dataFetcher = new SBBDataFetcher({ dataSet: "haltestelle-haltekante" });
    this.stopGeometry = new StopGeometry();
    this.nameFormatter = new StopNameFormatter();
    this.venueMatcher = new VenueMatcher();
    this.wazeVenueFetcher = new WazeVenueFetcher();
    this.clusterManager = new ClusterManager();
    this.featureKinds = new Map();
    this.clusterData = new Map();
    this.styleContext = this.buildStyleContext();
    this.styleRules = this.buildStyleRules();
  }

  private buildStyleContext(): SdkFeatureStyleContext {
    return {
      externalGraphic: ({ feature }) => {
        const id = String(feature?.id ?? "");
        const kind = this.featureKinds.get(id);
        if (kind === "obsolete-venue") return RED_STOP_SVG;
        if (kind === "cluster-sbb") {
          return this.clusterData.get(id)?.svgDataUrl ?? ORANGE_STOP_SVG;
        }
        if (kind === "cluster-obsolete") {
          return this.clusterData.get(id)?.svgDataUrl ?? RED_STOP_SVG;
        }
        return ORANGE_STOP_SVG;
      },
      pointRadius: ({ feature }) => {
        const id = String(feature?.id ?? "");
        const kind = this.featureKinds.get(id);
        return kind === "cluster-sbb" || kind === "cluster-obsolete" ? 20 : 13;
      },
    };
  }

  private buildStyleRules(): SdkFeatureStyleRule[] {
    return [
      {
        style: {
          fillOpacity: 1,
          cursor: "pointer",
          pointRadius: "${pointRadius}",
          externalGraphic: "${externalGraphic}",
        },
      },
    ];
  }

  // --- Abstract method implementations ---

  getRecordId(args: { record: unknown }): string {
    const record = args.record as TransportStop;
    return String(record.number);
  }

  mapRecordToFeature(args: { record: unknown }): SdkFeature {
    const record = args.record as TransportStop;
    return {
      geometry: {
        coordinates: [record.geopos_haltestelle.lon, record.geopos_haltestelle.lat],
        type: "Point",
      },
      type: "Feature",
      id: String(record.number),
    };
  }

  async *fetchData(args: {
    wmeSDK: WmeSDK;
  }): AsyncGenerator<TransportStop[], void, unknown> {
    for await (const batch of this.dataFetcher.fetchRecords({ wmeSDK: args.wmeSDK })) {
      yield batch as TransportStop[];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shouldDrawRecord(_args: {
    wmeSDK: WmeSDK;
    record: unknown;
    context?: unknown;
  }): boolean {
    // render() manages feature visibility directly; this stub satisfies the abstract contract
    return true;
  }

  // --- render() override ---

  override async render(args: { wmeSDK: WmeSDK }): Promise<void> {
    const { wmeSDK } = args;
    const generation = ++this.renderGeneration;

    if (!wmeSDK.LayerSwitcher.isLayerCheckboxChecked({ name: this.name })) return;

    const zoomLevel = wmeSDK.Map.getZoomLevel();
    if (zoomLevel < this.minZoomLevel) {
      // Below the threshold we show nothing — clear any features left over from
      // a higher zoom so stale clusters don't linger (and stay clickable).
      this.applyDiff({ wmeSDK, desired: [] });
      return;
    }

    // Fetch SBB stops and Waze API venues in parallel.
    const [sbbStops, wazeVenues] = await Promise.all([
      this.collectAllSBBStops({ wmeSDK }),
      this.wazeVenueFetcher.fetchVenues({ wmeSDK }),
    ]);
    if (this.isStale(generation)) return;

    // The Waze Features API only returns saved venues; the SDK data model also
    // exposes venues created/edited locally but not yet saved. Merge both so a
    // freshly created (unsaved) stop is matched and not redrawn in orange.
    const venues = this.mergeVenues({ wmeSDK, wazeVenues });

    // Filtering happens BEFORE clustering, chunked so the map stays responsive.
    // Phase 1: SBB stops without an exact WME venue match → orange.
    const orangeStops = await this.filterOrangeStops({
      sbbStops,
      venues,
      generation,
    });
    if (this.isStale(generation)) return;

    // Phase 2: WME transport venues with no matching SBB stop → red (obsolete).
    const obsoleteVenues = await this.filterObsoleteVenues({
      venues,
      sbbStops,
      generation,
    });
    if (this.isStale(generation)) return;

    const desired =
      zoomLevel < 15
        ? this.buildClusteredFeatures({ orangeStops, obsoleteVenues, zoomLevel })
        : this.buildIndividualFeatures({ orangeStops, obsoleteVenues });
    if (this.isStale(generation)) return;

    this.applyDiff({ wmeSDK, desired });
  }

  /** A render is stale once a newer render() call has bumped the generation. */
  private isStale(generation: number): boolean {
    return generation !== this.renderGeneration;
  }

  /**
   * Union of Waze API venues and SDK data-model venues, deduped by id and
   * restricted to transport categories. SDK entries win on conflict so local
   * unsaved edits take precedence over the server snapshot.
   */
  private mergeVenues(args: {
    wmeSDK: WmeSDK;
    wazeVenues: VenueLike[];
  }): VenueLike[] {
    const byId = new Map<string, VenueLike>();
    for (const venue of args.wazeVenues) {
      byId.set(String(venue.id), venue);
    }
    const sdkVenues = args.wmeSDK.DataModel.Venues.getAll() as VenueLike[];
    for (const venue of sdkVenues) {
      const isTransport = venue.categories.some((c) =>
        TRANSPORT_CATEGORIES.includes(c),
      );
      if (isTransport) byId.set(String(venue.id), venue);
    }
    return Array.from(byId.values());
  }

  private async filterOrangeStops(args: {
    sbbStops: TransportStop[];
    venues: VenueLike[];
    generation: number;
  }): Promise<TransportStop[]> {
    const result: TransportStop[] = [];
    let processed = 0;

    for (const stop of args.sbbStops) {
      const stopLonLat = stop.meansoftransport ? this.stopLonLat(stop) : null;
      if (stopLonLat) {
        const { name } = this.nameFormatter.formatName(stop);
        const categories = this.venueCategories({
          meansoftransport: stop.meansoftransport,
        });
        const matched = this.venueMatcher.hasExactMatch({
          venues: args.venues,
          stopLon: stopLonLat.lon,
          stopLat: stopLonLat.lat,
          stopName: name,
          categories,
        });
        if (!matched) result.push(stop);
      }

      if (++processed % MATCH_CHUNK_SIZE === 0) {
        await yieldToEventLoop();
        if (this.isStale(args.generation)) return result;
      }
    }

    return result;
  }

  private async filterObsoleteVenues(args: {
    venues: VenueLike[];
    sbbStops: TransportStop[];
    generation: number;
  }): Promise<VenueLike[]> {
    const result: VenueLike[] = [];
    let processed = 0;

    for (const venue of args.venues) {
      // Ports / marinas / harbors are transport venues but the SBB stop dataset
      // is not authoritative for them (many are pleasure ports with no boat
      // stop), so they must never be flagged as obsolete.
      const isExemptFromObsolete = venue.categories.some((c) =>
        OBSOLETE_EXEMPT_CATEGORIES.includes(c),
      );
      if (
        !isExemptFromObsolete &&
        !this.isCoveredBySBBStop({ venue, sbbStops: args.sbbStops })
      ) {
        result.push(venue);
      }

      if (++processed % MATCH_CHUNK_SIZE === 0) {
        await yieldToEventLoop();
        if (this.isStale(args.generation)) return result;
      }
    }

    return result;
  }

  /** Synchronously reconcile the map with the desired feature set (no awaits). */
  private applyDiff(args: { wmeSDK: WmeSDK; desired: DesiredFeature[] }): void {
    const { wmeSDK, desired } = args;

    const newIds = new Set(desired.map((f) => f.id));
    const staleIds = Array.from(this.visibleFeatureIds).filter(
      (id) => !newIds.has(id),
    );

    if (staleIds.length > 0) {
      wmeSDK.Map.removeFeaturesFromLayer({
        featureIds: staleIds,
        layerName: this.name,
      });
      for (const id of staleIds) {
        this.visibleFeatureIds.delete(id);
        this.features.delete(id);
        this.featureKinds.delete(id);
        this.clusterData.delete(id);
      }
    }

    const toAdd = desired.filter((f) => !this.visibleFeatureIds.has(f.id));
    if (toAdd.length > 0) {
      // Populate the lookup maps BEFORE adding features: the SDK invokes the
      // styleContext callbacks synchronously during addFeaturesToLayer, so the
      // kind/cluster data must already be present — otherwise clusters draw
      // with the default stop icon (and radius 13) instead of the cluster icon.
      for (const f of toAdd) {
        this.visibleFeatureIds.add(f.id);
        this.features.set(f.id, f.record);
        this.featureKinds.set(f.id, f.kind);
        if (f.clusterDisplayData) {
          this.clusterData.set(f.id, f.clusterDisplayData);
        }
      }
      wmeSDK.Map.addFeaturesToLayer({
        features: toAdd.map((f) => f.sdkFeature),
        layerName: this.name,
      });
    }
  }

  override refilterFeatures(args: { wmeSDK: WmeSDK }): void {
    void this.render(args);
  }

  override removeFromMap(args: { wmeSDK: WmeSDK }): void {
    super.removeFromMap(args);
    // Cancel any in-flight render so it can't re-add features after teardown.
    this.renderGeneration++;
    this.features.clear();
    this.featureKinds.clear();
    this.clusterData.clear();
  }

  // --- Click routing ---

  override async featureClicked(args: {
    wmeSDK: WmeSDK;
    featureId: string | number;
  }): Promise<void> {
    const { wmeSDK, featureId } = args;
    const id = String(featureId);
    const kind = this.featureKinds.get(id);

    if (kind === "cluster-sbb" || kind === "cluster-obsolete") {
      this.handleClusterClick({ wmeSDK, featureId: id });
    } else if (kind === "obsolete-venue") {
      await this.handleObsoleteVenueClick({ wmeSDK, featureId: id });
    } else {
      await this.handleSBBStopClick({ wmeSDK, featureId });
    }
  }

  // --- Private: feature set builders ---

  private buildIndividualFeatures(args: {
    orangeStops: TransportStop[];
    obsoleteVenues: VenueLike[];
  }): DesiredFeature[] {
    const result: DesiredFeature[] = [];

    for (const stop of args.orangeStops) {
      result.push({
        id: String(stop.number),
        sdkFeature: this.mapRecordToFeature({ record: stop }),
        kind: "sbb-stop",
        record: stop,
      });
    }

    for (const venue of args.obsoleteVenues) {
      const center = this.getVenueCenter(venue);
      if (!center) continue;
      const id = `venue-${venue.id}`;
      result.push({
        id,
        sdkFeature: {
          type: "Feature",
          id,
          geometry: { type: "Point", coordinates: [center.lon, center.lat] },
        },
        kind: "obsolete-venue",
        record: venue,
      });
    }

    return result;
  }

  private buildClusteredFeatures(args: {
    orangeStops: TransportStop[];
    obsoleteVenues: VenueLike[];
    zoomLevel: number;
  }): DesiredFeature[] {
    const result: DesiredFeature[] = [];
    const { zoomLevel } = args;

    // Cluster orange SBB stops
    const orangeItems = args.orangeStops
      .map((stop) => {
        const lonLat = this.stopLonLat(stop);
        if (!lonLat) return null;
        return {
          id: String(stop.number),
          lat: lonLat.lat,
          lon: lonLat.lon,
          kind: "sbb-stop" as const,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const orangeResult = this.clusterManager.cluster({ items: orangeItems, zoomLevel });
    const orangeStopById = new Map(
      args.orangeStops.map((s) => [String(s.number), s]),
    );

    for (const cluster of orangeResult.clusters) {
      const svgDataUrl = generateClusterSvg(ORANGE_COLOR, cluster.count);
      result.push(this.clusterToFeature(cluster, "cluster-sbb", svgDataUrl));
    }
    for (const item of orangeResult.singles) {
      const stop = orangeStopById.get(item.id);
      if (!stop) continue;
      result.push({
        id: item.id,
        sdkFeature: this.mapRecordToFeature({ record: stop }),
        kind: "sbb-stop",
        record: stop,
      });
    }

    // Cluster red (obsolete) venues
    const redItems = args.obsoleteVenues
      .map((venue) => {
        const center = this.getVenueCenter(venue);
        if (!center) return null;
        return {
          id: `venue-${venue.id}`,
          lat: center.lat,
          lon: center.lon,
          kind: "obsolete-venue" as const,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const redResult = this.clusterManager.cluster({ items: redItems, zoomLevel });
    const obsoleteById = new Map(
      args.obsoleteVenues.map((v) => [`venue-${v.id}`, v]),
    );

    for (const cluster of redResult.clusters) {
      const svgDataUrl = generateClusterSvg(RED_COLOR, cluster.count);
      result.push(this.clusterToFeature(cluster, "cluster-obsolete", svgDataUrl));
    }
    for (const item of redResult.singles) {
      const venue = obsoleteById.get(item.id);
      if (!venue) continue;
      const center = this.getVenueCenter(venue);
      if (!center) continue;
      result.push({
        id: item.id,
        sdkFeature: {
          type: "Feature",
          id: item.id,
          geometry: { type: "Point", coordinates: [center.lon, center.lat] },
        },
        kind: "obsolete-venue",
        record: venue,
      });
    }

    return result;
  }

  private clusterToFeature(
    cluster: ClusterGroup,
    kind: "cluster-sbb" | "cluster-obsolete",
    svgDataUrl: string,
  ): DesiredFeature {
    return {
      id: cluster.id,
      sdkFeature: {
        type: "Feature",
        id: cluster.id,
        geometry: {
          type: "Point",
          coordinates: [cluster.center.lon, cluster.center.lat],
        },
      },
      kind,
      record: cluster,
      clusterDisplayData: {
        bbox: cluster.bbox,
        count: cluster.count,
        itemIds: cluster.itemIds,
        svgDataUrl,
      },
    };
  }

  // --- Private: data helpers ---

  private async collectAllSBBStops(args: {
    wmeSDK: WmeSDK;
  }): Promise<TransportStop[]> {
    const stops: TransportStop[] = [];
    for await (const batch of this.dataFetcher.fetchRecords({ wmeSDK: args.wmeSDK })) {
      stops.push(...(batch as TransportStop[]));
    }
    return stops;
  }

  private isCoveredBySBBStop(args: {
    venue: VenueLike;
    sbbStops: TransportStop[];
  }): boolean {
    const { venue, sbbStops } = args;
    return sbbStops.some((stop) => {
      if (!stop.meansoftransport) return false;
      const stopLonLat = this.stopLonLat(stop);
      if (!stopLonLat) return false;

      const stopCategories = this.venueCategories({
        meansoftransport: stop.meansoftransport,
      });
      const hasMatchingCategory = venue.categories.some((c) =>
        stopCategories.includes(c),
      );
      if (!hasMatchingCategory) return false;

      const stopPoint = point([stopLonLat.lon, stopLonLat.lat]);
      const isClose = this.stopGeometry.isWithinRadius({
        stopPoint,
        venueGeometry: venue.geometry,
        radiusMeters: 75,
      });
      if (!isClose) return false;

      const { shortName } = this.nameFormatter.formatName(stop);
      const venueLower = venue.name.toLowerCase();
      const shortLower = shortName.toLowerCase();
      return venueLower.includes(shortLower) || shortLower.includes(venueLower);
    });
  }

  private getVenueCenter(
    venue: VenueLike,
  ): { lat: number; lon: number } | null {
    const geo = venue.geometry;
    if (!geo) return null;
    if (geo.type === "Point") {
      const coords = geo.coordinates as number[];
      return { lon: coords[0], lat: coords[1] };
    }
    if (geo.type === "Polygon") {
      const ring = (geo.coordinates as number[][][])[0];
      return {
        lon: ring.reduce((s, c) => s + c[0], 0) / ring.length,
        lat: ring.reduce((s, c) => s + c[1], 0) / ring.length,
      };
    }
    if (geo.type === "MultiPolygon") {
      const ring = (geo.coordinates as number[][][][])[0][0];
      return {
        lon: ring.reduce((s, c) => s + c[0], 0) / ring.length,
        lat: ring.reduce((s, c) => s + c[1], 0) / ring.length,
      };
    }
    return null;
  }

  meansOfTransport(args: { meansoftransport: string }): string[] {
    return args.meansoftransport.split("|");
  }

  venueCategories(args: { meansoftransport: string }): string[] {
    return this.meansOfTransport(args).map((mean) => {
      if (mean === "METRO") return "SUBWAY_STATION";
      if (mean === "BOAT") return "SEAPORT_MARINA_HARBOR";
      if (mean === "CHAIRLIFT") return "TRANSPORTATION";
      return `${mean}_STATION`;
    });
  }

  private stopLonLat(
    record: TransportStop,
  ): { lat: number; lon: number } | null {
    const lat = parseFloat(
      String(record.geopos_haltestelle?.lat || record.lat || 0),
    );
    const lon = parseFloat(
      String(record.geopos_haltestelle?.lon || record.lon || 0),
    );
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  }

  // --- Private: click handlers ---

  private handleClusterClick(args: {
    wmeSDK: WmeSDK;
    featureId: string;
  }): void {
    const { wmeSDK, featureId } = args;
    const data = this.clusterData.get(featureId);
    if (!data) return;
    const [minLon, minLat, maxLon, maxLat] = data.bbox;
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const zoomLevel = this.clusterManager.zoomForBbox(data.bbox);
    wmeSDK.Map.setMapCenter({ lonLat: { lat: centerLat, lon: centerLon }, zoomLevel });
  }

  private async handleObsoleteVenueClick(args: {
    wmeSDK: WmeSDK;
    featureId: string;
  }): Promise<void> {
    const { wmeSDK, featureId } = args;
    const venue = this.features.get(featureId) as VenueLike | undefined;
    if (!venue) return;

    const result = await showWmeDialog({
      message: i18next.t("common:deleteObsoleteStop.message", {
        name: venue.name,
      }),
      buttons: [
        {
          label: i18next.t("common:deleteObsoleteStop.confirm"),
          value: "confirm",
        },
        {
          label: i18next.t("common:deleteObsoleteStop.cancel"),
          value: "cancel",
        },
      ],
    });

    if (result !== "confirm") return;

    wmeSDK.DataModel.Venues.deleteVenue({ venueId: String(venue.id) });
    this.removeFeature({ wmeSDK, featureId });
    this.featureKinds.delete(featureId);
    this.features.delete(featureId);
  }

  private async handleSBBStopClick(args: {
    wmeSDK: WmeSDK;
    featureId: string | number;
  }): Promise<void> {
    const { wmeSDK, featureId } = args;
    const id = String(featureId); // normalize to string — features map uses string keys
    const stop = this.features.get(id) as TransportStop | undefined;
    if (!stop) return;

    const stopLonLat = this.stopLonLat(stop);
    if (!stopLonLat) return;

    const { lat, lon } = stopLonLat;
    const zoomLevel = wmeSDK.Map.getZoomLevel();

    if (zoomLevel < ADD_VENUE_MIN_ZOOM) {
      this.handleZoomRequired({ wmeSDK, lat, lon });
      return;
    }

    const { name, shortName, aliases } = this.nameFormatter.formatName(stop);
    const venueCategories = this.venueCategories({
      meansoftransport: stop.meansoftransport,
    });
    const allVenues = wmeSDK.DataModel.Venues.getAll() as VenueLike[];
    const categoryFilteredVenues = allVenues.filter((v) =>
      v.categories.some((cat) => venueCategories.includes(cat)),
    );

    let venuesToUpdate: Array<VenueLike & { _updateCoordinates?: boolean }> = [];

    if (categoryFilteredVenues.length > 0) {
      const matchingVenues = this.venueMatcher.findMatchingVenues({
        venues: categoryFilteredVenues,
        stopLon: lon,
        stopLat: lat,
        stopName: name,
        stopShortName: shortName,
        categories: venueCategories,
        radiusMeters: 75,
      });

      if (matchingVenues.length > 0) {
        const { action, venues } = await this.promptUserAction({
          wmeSDK,
          matchingVenues,
        });
        if (action === "cancel") return;
        venuesToUpdate = venues as Array<
          VenueLike & { _updateCoordinates?: boolean }
        >;
      }
    }

    const updatedVenues = await this.createOrUpdateVenue({
      wmeSDK,
      venuesToUpdate,
      lon,
      lat,
      name,
      aliases,
      categories: venueCategories,
    });

    wmeSDK.Editing.setSelection({
      selection: {
        ids: updatedVenues.map((venue) => venue.id.toString()),
        objectType: "venue",
      },
    });
    this.removeFeature({ wmeSDK, featureId });
    this.featureKinds.delete(id);
    this.features.delete(id);
  }

  private handleZoomRequired(args: {
    wmeSDK: WmeSDK;
    lat: number;
    lon: number;
  }): void {
    const { wmeSDK, lat, lon } = args;
    this.unregisterEvents();
    wmeSDK.Map.setMapCenter({
      lonLat: { lat, lon },
      zoomLevel: ADD_VENUE_ZOOM_IN_LEVEL,
    });
    this.registerEvents({ wmeSDK });
    waitForMapIdle({ wmeSDK, intervalMs: 50, maxTries: 60 }).then(() => {
      this.refilterFeatures({ wmeSDK });
    });
  }

  private async promptUserAction(args: {
    wmeSDK: WmeSDK;
    matchingVenues: VenueLike[];
  }): Promise<{
    action: "merge" | "merge-with-coords" | "save" | "cancel";
    venues: VenueLike[];
  }> {
    const { wmeSDK, matchingVenues } = args;
    wmeSDK.Editing.setSelection({
      selection: {
        ids: matchingVenues.map((venue) => venue.id.toString()),
        objectType: "venue",
      },
    });
    const result = await showWmeDialog({
      message: i18next.t("common:venueMatchDialog.message", {
        venueCount: matchingVenues.length,
      }),
      buttons: [
        { label: i18next.t("common:venueMatchDialog.merge"), value: "merge" },
        {
          label: i18next.t("common:venueMatchDialog.mergeWithCoords"),
          value: "merge-with-coords",
        },
        {
          label: i18next.t("common:venueMatchDialog.saveNew"),
          value: "save",
        },
        {
          label: i18next.t("common:venueMatchDialog.cancel"),
          value: "cancel",
        },
      ],
    });

    let venuesToUpdate = matchingVenues;
    if (result === "save") {
      venuesToUpdate = [];
    } else if (result === "merge-with-coords") {
      venuesToUpdate = matchingVenues.map((v) => ({
        ...v,
        _updateCoordinates: true,
      }));
    }

    return {
      action: result as "merge" | "merge-with-coords" | "save" | "cancel",
      venues: venuesToUpdate,
    };
  }

  private async createOrUpdateVenue(args: {
    wmeSDK: WmeSDK;
    venuesToUpdate: Array<VenueLike & { _updateCoordinates?: boolean }>;
    lon: number;
    lat: number;
    name: string;
    aliases: string[];
    categories: string[];
  }): Promise<Array<VenueLike & { _updateCoordinates?: boolean }>> {
    const { wmeSDK, venuesToUpdate, lon, lat, name, aliases, categories } = args;
    let venues = venuesToUpdate;

    if (venues.length === 0) {
      const geometry = {
        type: "Point" as const,
        coordinates: [lon, lat] as [number, number],
      };
      const venueId = wmeSDK.DataModel.Venues.addVenue({
        category: "TRANSPORTATION" as const,
        geometry,
      });
      const newVenue = wmeSDK.DataModel.Venues.getById({
        venueId: venueId.toString(),
      });
      if (newVenue) venues = [newVenue as VenueLike];
    }

    for (const venue of venues) {
      const updateArgs = {
        venueId: venue.id.toString(),
        name,
        aliases,
        categories: categories as VenueCategoryId[],
        ...(venue._updateCoordinates && {
          geometry: {
            type: "Point" as const,
            coordinates: [lon, lat] as [number, number],
          },
        }),
      };
      wmeSDK.DataModel.Venues.updateVenue(
        updateArgs as Parameters<typeof wmeSDK.DataModel.Venues.updateVenue>[0],
      );
    }

    return venues;
  }
}

export { PublicTransportStopsLayer };
