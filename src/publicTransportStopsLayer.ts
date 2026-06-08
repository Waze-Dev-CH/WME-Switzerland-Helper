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
import { WazeVenueFetcher } from "./wazeVenueFetcher";
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
  private renderInProgress = false;

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
          pointRadius: "pointRadius",
          externalGraphic: "externalGraphic" as string,
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
    if (this.renderInProgress) return;
    this.renderInProgress = true;
    try {
      const { wmeSDK } = args;

      if (!wmeSDK.LayerSwitcher.isLayerCheckboxChecked({ name: this.name })) return;

      const zoomLevel = wmeSDK.Map.getZoomLevel();
      if (zoomLevel < this.minZoomLevel) return;

      const [sbbStops, wazeVenues] = await Promise.all([
        this.collectAllSBBStops({ wmeSDK }),
        this.wazeVenueFetcher.fetchVenues({ wmeSDK }),
      ]);

      // Phase 1: SBB stops without an exact WME venue match → orange
      const orangeStops = sbbStops.filter((stop) => {
        if (!stop.meansoftransport) return false;
        const stopLonLat = this.stopLonLat(stop);
        if (!stopLonLat) return false;
        const { name } = this.nameFormatter.formatName(stop);
        const categories = this.venueCategories({
          meansoftransport: stop.meansoftransport,
        });
        return !this.venueMatcher.hasExactMatch({
          venues: wazeVenues,
          stopLon: stopLonLat.lon,
          stopLat: stopLonLat.lat,
          stopName: name,
          categories,
        });
      });

      // Phase 2: WME transport venues with no matching SBB stop → red
      const obsoleteVenues = wazeVenues.filter(
        (venue) => !this.isCoveredBySBBStop({ venue, sbbStops }),
      );

      const desired =
        zoomLevel < 15
          ? this.buildClusteredFeatures({ orangeStops, obsoleteVenues, zoomLevel })
          : this.buildIndividualFeatures({ orangeStops, obsoleteVenues });

      // Diff: remove stale features, add new ones
      const newIds = new Set(desired.map((f) => f.id));
      const staleIds = Array.from(this.visibleFeatureIds).filter(
        (id) => !newIds.has(id),
      );

      if (staleIds.length > 0) {
        wmeSDK.Map.removeFeaturesFromLayer({ featureIds: staleIds, layerName: this.name });
        for (const id of staleIds) {
          this.visibleFeatureIds.delete(id);
          this.features.delete(id);
          this.featureKinds.delete(id);
          this.clusterData.delete(id);
        }
      }

      const toAdd = desired.filter((f) => !this.visibleFeatureIds.has(f.id));
      if (toAdd.length > 0) {
        wmeSDK.Map.addFeaturesToLayer({
          features: toAdd.map((f) => f.sdkFeature),
          layerName: this.name,
        });
        for (const f of toAdd) {
          this.visibleFeatureIds.add(f.id);
          this.features.set(f.id, f.record);
          this.featureKinds.set(f.id, f.kind);
          if (f.clusterDisplayData) {
            this.clusterData.set(f.id, f.clusterDisplayData);
          }
        }
      }
    } finally {
      this.renderInProgress = false;
    }
  }

  override refilterFeatures(args: { wmeSDK: WmeSDK }): void {
    void this.render(args);
  }

  override removeFromMap(args: { wmeSDK: WmeSDK }): void {
    super.removeFromMap(args);
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

    if (zoomLevel < 17) {
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
    wmeSDK.Map.setMapCenter({ lonLat: { lat, lon }, zoomLevel: 17 });
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
      message: `Il semble qu'il existe déjà ${matchingVenues.length} arrêt(s) avec ce nom.<br/>Nous les avons sélectionnés pour vous.<br/>Que voulez-vous faire?<br/>Sélectionner <pre style="display: inline;">Fusionner</pre> appliquera les informations aux anciens points sans créer le nouveau.`,
      buttons: [
        { label: "Fusionner", value: "merge" },
        {
          label: "Fusionner et mettre à jour les coordonnées",
          value: "merge-with-coords",
        },
        { label: "Enregistrer le nouveau", value: "save" },
        { label: "Annuler", value: "cancel" },
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
