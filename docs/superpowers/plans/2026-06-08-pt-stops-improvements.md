# PT Stops Layer — Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three features to the WME Switzerland Helper PT stops layer: (1) parallel Waze venue fetch via direct API (fixes low-zoom missing venues), (2) show obsolete WME transport venues in red with a click-to-delete dialog, and (3) greedy clustering at zoom 13–14 for both orange and red features.

**Architecture:** `render()` is fully overridden in `PublicTransportStopsLayer` — it fetches SBB stops and Waze venues in parallel, filters each against the other, then either clusters (zoom 13–14) or shows features individually (zoom ≥ 15). Dynamic icon coloring uses `styleContext` closures over instance maps (`featureKinds`, `clusterData`). Two new modules: `WazeVenueFetcher` (HTTP to Waze Features API) and `ClusterManager` (greedy distance-based grouping).

**Tech Stack:** TypeScript 5.6, WME SDK (`wme-sdk-typings`), `@turf/turf`, `GM.xmlHttpRequest`, `i18next`, `btoa` (browser built-in).

> **Icon note:** The user mentioned `w-icon w-icon-bus w-icon-2x` (Waze font icon). That CSS class works for DOM elements (sidebar, dialogs). Map features require `externalGraphic` (SVG data URL), so we generate SVGs via `btoa`. The font icon is not applicable to map layer features.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `header.js` | Modify | Add `@connect beta.waze.com` and `@connect www.waze.com` |
| `locales/en/common.json` | Modify | Add `deleteObsoleteStop.{message,confirm,cancel}` |
| `locales/fr/common.json` | Modify | Add `deleteObsoleteStop.{message,confirm,cancel}` |
| `locales/de/common.json` | Modify | Add `deleteObsoleteStop.{message,confirm,cancel}` |
| `locales/it/common.json` | Modify | Add `deleteObsoleteStop.{message,confirm,cancel}` |
| `src/wazeVenueFetcher.ts` | **Create** | Fetch transport venues from Waze Features API (venueLevel=4) |
| `src/clusterManager.ts` | **Create** | Greedy distance-based clustering + bbox→ZoomLevel helper |
| `src/publicTransportStopsLayer.ts` | **Rewrite** | render() override, dynamic SVG styles, obsolete detection |
| `main.user.ts` | Modify | Remove static `styleRules` from `PublicTransportStopsLayer` call |

---

## Task 1: Prerequisites — header.js + i18n keys

**Files:**
- Modify: `header.js`
- Modify: `locales/en/common.json`
- Modify: `locales/fr/common.json`
- Modify: `locales/de/common.json`
- Modify: `locales/it/common.json`

- [ ] **Step 1: Add @connect directives to header.js**

In `header.js`, add two lines after `// @connect      data.sbb.ch` (currently line 18):

```js
// @connect      beta.waze.com
// @connect      www.waze.com
```

Final block (lines 16–19):
```js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api3.geo.admin.ch
// @connect      data.sbb.ch
// @connect      beta.waze.com
// @connect      www.waze.com
```

- [ ] **Step 2: Add i18n key to locales/en/common.json**

Insert before the closing `}` of the JSON object:

```json
  "deleteObsoleteStop": {
    "message": "The venue \"{{name}}\" has no matching SBB stop. Do you want to delete it?",
    "confirm": "Delete",
    "cancel": "Cancel"
  }
```

- [ ] **Step 3: Add i18n key to locales/fr/common.json**

Insert before the closing `}`:

```json
  "deleteObsoleteStop": {
    "message": "Le lieu \"{{name}}\" n'a pas d'arrêt SBB correspondant. Voulez-vous le supprimer ?",
    "confirm": "Supprimer",
    "cancel": "Annuler"
  }
```

- [ ] **Step 4: Add i18n key to locales/de/common.json**

Insert before the closing `}`:

```json
  "deleteObsoleteStop": {
    "message": "Der Ort \"{{name}}\" hat keine entsprechende SBB-Haltestelle. Möchten Sie ihn löschen?",
    "confirm": "Löschen",
    "cancel": "Abbrechen"
  }
```

- [ ] **Step 5: Add i18n key to locales/it/common.json**

Insert before the closing `}`:

```json
  "deleteObsoleteStop": {
    "message": "La location \"{{name}}\" non ha una fermata SBB corrispondente. Vuoi eliminarla?",
    "confirm": "Elimina",
    "cancel": "Annulla"
  }
```

- [ ] **Step 6: Verify build passes**

```bash
npm run build
```

Expected: zero errors, `releases/release-1.0.0.user.js` updated.

- [ ] **Step 7: Commit**

```bash
git add header.js locales/en/common.json locales/fr/common.json locales/de/common.json locales/it/common.json
git commit -m "feat(transport): add @connect directives and delete dialog i18n keys"
```

---

## Task 2: Create `src/wazeVenueFetcher.ts`

**Files:**
- Create: `src/wazeVenueFetcher.ts`

**Context:** The WME SDK's `DataModel.Venues.getAll()` only returns venues loaded into the current data model, which at zoom < 17 (venueLevel=3) does not include `BUS_STATION` or `TRAIN_STATION` objects. This fetcher calls the API directly with `venueLevel=4` to always get transport venues regardless of zoom.

- [ ] **Step 1: Create the file**

Create `src/wazeVenueFetcher.ts` with this full content:

```typescript
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

import { WmeSDK } from "wme-sdk-typings";
import { type VenueLike } from "./venueMatcher";
import { type VenueGeometry } from "./stopGeometry";

const TRANSPORT_CATEGORIES = [
  "BUS_STATION",
  "TRAIN_STATION",
  "SUBWAY_STATION",
  "SEAPORT_MARINA_HARBOR",
  "TRANSPORTATION",
];

interface WazeApiVenueObject {
  id: number | string;
  name: string;
  categories: unknown[];
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface WazeApiResponse {
  venues?: {
    objects?: WazeApiVenueObject[];
  };
}

class WazeVenueFetcher {
  private getApiBaseUrl(): string {
    const { origin, pathname } = window.location;
    const region = pathname.split("/")[1] ?? "";
    return `${origin}/${region}`;
  }

  async fetchVenues(args: { wmeSDK: WmeSDK }): Promise<VenueLike[]> {
    const extent = args.wmeSDK.Map.getMapExtent();
    const [x1, y1, x2, y2] = extent;
    const bbox = `${x1},${y1},${x2},${y2}`;
    const url = `${this.getApiBaseUrl()}/app/Features?bbox=${encodeURIComponent(bbox)}&v=2&apiV2=true&venueLevel=4&venueFilter=1,1,1,0`;

    const response = await GM.xmlHttpRequest({
      method: "GET",
      url,
      responseType: "json",
    });

    const data = response.response as WazeApiResponse;
    const objects = data?.venues?.objects ?? [];

    return objects
      .filter(
        (obj) =>
          obj.id !== undefined &&
          obj.name &&
          obj.geometry &&
          (obj.categories as unknown[]).some(
            (c) => typeof c === "string" && TRANSPORT_CATEGORIES.includes(c),
          ),
      )
      .map((obj) => ({
        id: obj.id,
        name: obj.name,
        categories: (obj.categories as unknown[])
          .filter((c) => typeof c === "string")
          .map((c) => c as string),
        geometry: obj.geometry as VenueGeometry,
      }));
  }
}

export { WazeVenueFetcher, TRANSPORT_CATEGORIES };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run compile
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/wazeVenueFetcher.ts
git commit -m "feat(transport): add WazeVenueFetcher for direct API venue loading"
```

---

## Task 3: Create `src/clusterManager.ts`

**Files:**
- Create: `src/clusterManager.ts`

**Context:** Greedy algorithm: sort items by latitude, then for each unassigned item, collect all unassigned items within radius R into a group. If a group has only 1 item, it is a "single" (shown as an individual feature). Groups of 2+ become clusters. `zoomForBbox` maps a bounding box span to the tightest zoom level that fits it, used when clicking a cluster to zoom in.

- [ ] **Step 1: Create the file**

Create `src/clusterManager.ts` with this full content:

```typescript
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

import { ZoomLevel } from "wme-sdk-typings";
import { haversineDistance } from "./utils";

interface ClusterItem {
  id: string;
  lat: number;
  lon: number;
  kind: "sbb-stop" | "obsolete-venue";
}

interface ClusterGroup {
  id: string;
  center: { lat: number; lon: number };
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  count: number;
  kind: "sbb-stop" | "obsolete-venue";
  itemIds: string[];
}

const CLUSTER_RADIUS_METERS: Record<number, number> = {
  13: 2000,
  14: 800,
};

class ClusterManager {
  cluster(args: {
    items: ClusterItem[];
    zoomLevel: number;
  }): { clusters: ClusterGroup[]; singles: ClusterItem[] } {
    const { items, zoomLevel } = args;
    const radius = CLUSTER_RADIUS_METERS[zoomLevel] ?? 800;

    const sorted = [...items].sort((a, b) => a.lat - b.lat);
    const assigned = new Set<string>();
    const clusters: ClusterGroup[] = [];
    const singles: ClusterItem[] = [];

    for (const anchor of sorted) {
      if (assigned.has(anchor.id)) continue;

      const nearby = sorted.filter(
        (item) =>
          !assigned.has(item.id) &&
          haversineDistance(anchor.lat, anchor.lon, item.lat, item.lon) <= radius,
      );

      if (nearby.length === 1) {
        singles.push(anchor);
        assigned.add(anchor.id);
        continue;
      }

      for (const item of nearby) assigned.add(item.id);

      const lons = nearby.map((i) => i.lon);
      const lats = nearby.map((i) => i.lat);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);

      clusters.push({
        id: `cluster-${anchor.kind}-${anchor.id}`,
        center: { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 },
        bbox: [minLon, minLat, maxLon, maxLat],
        count: nearby.length,
        kind: anchor.kind,
        itemIds: nearby.map((i) => i.id),
      });
    }

    return { clusters, singles };
  }

  zoomForBbox(bbox: [number, number, number, number]): ZoomLevel {
    const spanLon = Math.abs(bbox[2] - bbox[0]);
    const spanLat = Math.abs(bbox[3] - bbox[1]);
    const maxSpan = Math.max(spanLon, spanLat);
    if (maxSpan < 0.004) return 17;
    if (maxSpan < 0.008) return 16;
    if (maxSpan < 0.016) return 15;
    if (maxSpan < 0.032) return 14;
    return 13;
  }
}

export { ClusterManager };
export type { ClusterGroup, ClusterItem };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run compile
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/clusterManager.ts
git commit -m "feat(transport): add ClusterManager for greedy distance-based clustering"
```

---

## Task 4: Rewrite `src/publicTransportStopsLayer.ts`

**Files:**
- Modify: `src/publicTransportStopsLayer.ts`

**Context:** Full content replacement. Key design decisions:
- `render()` is overridden: base class render() is NOT called (it only handles the SBB stop flow and cannot be reused for the two-phase fetch+filter approach).
- `styleContext` closures reference `this.featureKinds` and `this.clusterData` at render time; the SDK calls these functions on every map repaint.
- `shouldDrawRecord()` is a required abstract stub — returns `true` since render() manages visibility directly.
- `refilterFeatures()` delegates to `void this.render(args)` so map-move events trigger a full re-render.
- Feature ID key conventions: SBB stops use `String(stop.number)`, WME venues use `venue-${venue.id}`, clusters use `cluster-sbb-${anchorId}` or `cluster-obsolete-${anchorId}`.

- [ ] **Step 1: Replace the file with the full rewrite**

Full file content for `src/publicTransportStopsLayer.ts`:

```typescript
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
          externalGraphic: "externalGraphic",
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
  }

  override refilterFeatures(args: { wmeSDK: WmeSDK }): void {
    void this.render(args);
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
    const stop = this.features.get(featureId) as TransportStop | undefined;
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
    this.featureKinds.delete(String(featureId));
    this.features.delete(featureId);
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run compile
```

Expected: no TypeScript errors.

If you see `Property 'override' ...` or similar, note that `override` is valid TypeScript even without `noImplicitOverride: true` in tsconfig. If lint complains about a specific `override` keyword, remove it — the method still overrides correctly without the keyword.

- [ ] **Step 3: Run lint and fix any issues**

```bash
npm run lint
```

Fix any reported errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/publicTransportStopsLayer.ts
git commit -m "feat(transport): rewrite PT stops layer with parallel fetch, obsolete venues, and clustering"
```

---

## Task 5: Update `main.user.ts` + final build

**Files:**
- Modify: `main.user.ts`

- [ ] **Step 1: Remove static styleRules from the PublicTransportStopsLayer call**

In `main.user.ts`, find the `PublicTransportStopsLayer` instantiation (around line 124). Remove the `styleRules` array entirely.

Current code:
```typescript
new PublicTransportStopsLayer({
  wmeSDK: wmeSDK,
  name: i18next.t(
    "common:layers.public_transport_stops",
    "Public Transport Stops",
  ),
  styleRules: [
    {
      style: {
        fillOpacity: 1,
        cursor: "pointer",
        pointRadius: 13,
        externalGraphic:
          "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OSIgaGVpZ2h0PSI0OCIgZmlsbD0iYmxhY2siPjxjaXJjbGUgY3g9IjI0LjcyNiIgY3k9IjI0IiByPSIyMyIgZmlsbD0iI2U2N2UyMiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMjkuNzI2IDE0YTMgMyAwIDAgMSAyLjk5NSAyLjgyNGwuMDA1LjE3NnYxaDEuMDE3bC4xNS4wMDVjLjkzOC4wNiAxLjc2LjY4NCAxLjg0MyAxLjU5MWwuMDA3LjE1NFYyMmwtLjAwNy4xMTdhMSAxIDAgMCAxLS44NzYuODc2bC0uMTE3LjAwNy0uMTE3LS4wMDdhMSAxIDAgMCAxLS44NzYtLjg3NkwzMy43NDMgMjJ2LTJoLTEuMDE3djEwYTEgMSAwIDAgMS0uODgzLjk5M2wtLjExNy4wMDdoLTF2MS41YTEuNSAxLjUgMCAwIDEtMyAwVjMxaC02djEuNWExLjUgMS41IDAgMCAxLTMgMFYzMWgtMWExIDEgMCAwIDEtLjk5My0uODgzTDE2LjcyNiAzMFYyMGgtMXYyYTEgMSAwIDAgMS0uODgzLjk5M2wtLjExNy4wMDdhMSAxIDAgMCAxLS45OTMtLjg4M0wxMy43MjYgMjJ2LTIuMjVjMC0uOTkuODYtMS42ODIgMS44NS0xLjc0NWwuMTUtLjAwNWgxdi0xYTMgMyAwIDAgMSAyLjgyNC0yLjk5NWwuMTc2LS4wMDV6bS0xIDEzaC0xYTEgMSAwIDEgMCAwIDJoMWExIDEgMCAxIDAgMC0ybS03IDBoLTFhMSAxIDAgMSAwIDAgMmgxYTEgMSAwIDEgMCAwLTJtLS40MjktMTFoLTEuNTdsLS4xMTcuMDA3YTEgMSAwIDAgMC0uODc3Ljg3NmwtLjAwNy4xMTd2OGgxMnYtOGwtLjAwNy0uMTE3YTEgMSAwIDAgMC0uNzY0LS44NTdsLS4xMTItLjAyLS4xMTctLjAwNmgtMS41NzJsLS44NTQgMS40OTYtLjA2NS4xYTEgMSAwIDAgMS0uODAzLjQwNEgyMy4wMmwtLjExOS0uMDA3YTEgMSAwIDAgMS0uNzUtLjQ5N3oiLz48c2NyaXB0IHhtbG5zPSIiLz48L3N2Zz4=",
      },
    },
  ],
}),
```

Replace with:
```typescript
new PublicTransportStopsLayer({
  wmeSDK: wmeSDK,
  name: i18next.t(
    "common:layers.public_transport_stops",
    "Public Transport Stops",
  ),
}),
```

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: zero errors. `releases/release-1.0.0.user.js` updated.

- [ ] **Step 3: Lint check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add main.user.ts
git commit -m "feat(transport): simplify PT layer instantiation — styles now managed internally"
```

---

## Final verification checklist

- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` succeeds
- [ ] **Manual smoke test — zoom 15+:** Enable PT stops layer → orange SBB stop icons appear
- [ ] **Manual smoke test — zoom 13–14:** Orange cluster circles with counts appear; clicking zooms to the cluster bbox
- [ ] **Manual smoke test — obsolete venues:** If any WME transport venues with no SBB match exist in the current bbox, they appear red
- [ ] **Manual smoke test — red cluster:** Red cluster circles appear at zoom 13–14 if multiple obsolete venues are in the same area
- [ ] **Click red individual:** Confirmation dialog appears; pressing Delete removes the venue from WME and the red icon disappears
- [ ] **Click orange individual:** Existing merge/create dialog appears (unchanged behavior)
- [ ] **Click orange cluster:** Map centers and zooms to the cluster's bounding box
