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
  12: 4000,
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
          item.kind === anchor.kind &&
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
