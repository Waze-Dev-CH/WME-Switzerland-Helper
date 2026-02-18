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

import { booleanPointInPolygon, distance, point } from "@turf/turf";
import type { MultiPolygon, Point as GeoPoint, Polygon } from "geojson";

type VenueGeometry =
  | GeoPoint
  | Polygon
  | MultiPolygon
  | {
      type: string;
      coordinates: unknown;
    };

class StopGeometry {
  private pointToLineSegmentDistance(args: {
    point: ReturnType<typeof point>;
    lineStart: [number, number];
    lineEnd: [number, number];
  }): number {
    const { point: p, lineStart, lineEnd } = args;
    const [px, py] = p.geometry.coordinates;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;

    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx: number;
    let yy: number;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const closestPoint = point([xx, yy]);
    return distance(p, closestPoint, { units: "meters" });
  }

  distanceToVenueGeometry(args: {
    stopPoint: ReturnType<typeof point>;
    geometry: VenueGeometry;
  }): number | null {
    const { stopPoint, geometry } = args;

    if (geometry.type === "Point") {
      const coords = geometry.coordinates as number[];
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const [vLon, vLat] = coords;
      if (typeof vLon !== "number" || typeof vLat !== "number") return null;
      const venuePoint = point([vLon, vLat]);
      return distance(stopPoint, venuePoint, { units: "meters" });
    }

    if (geometry.type === "Polygon") {
      const polygon = geometry as Polygon;

      if (booleanPointInPolygon(stopPoint, polygon)) {
        return 0;
      }

      let minDistance = Infinity;

      for (const ring of polygon.coordinates) {
        for (let i = 0; i < ring.length - 1; i++) {
          const dist = this.pointToLineSegmentDistance({
            point: stopPoint,
            lineStart: ring[i] as [number, number],
            lineEnd: ring[i + 1] as [number, number],
          });
          minDistance = Math.min(minDistance, dist);
        }
      }

      return minDistance;
    }

    if (geometry.type === "MultiPolygon") {
      const multiPolygon = geometry as MultiPolygon;

      if (booleanPointInPolygon(stopPoint, multiPolygon)) {
        return 0;
      }

      let minDistance = Infinity;

      for (const polygon of multiPolygon.coordinates) {
        for (const ring of polygon) {
          for (let i = 0; i < ring.length - 1; i++) {
            const dist = this.pointToLineSegmentDistance({
              point: stopPoint,
              lineStart: ring[i] as [number, number],
              lineEnd: ring[i + 1] as [number, number],
            });
            minDistance = Math.min(minDistance, dist);
          }
        }
      }

      return minDistance;
    }

    return null;
  }

  isWithinRadius(args: {
    stopPoint: ReturnType<typeof point>;
    venueGeometry: VenueGeometry;
    radiusMeters: number;
  }): boolean {
    const { stopPoint, venueGeometry, radiusMeters } = args;
    const distMeters = this.distanceToVenueGeometry({
      stopPoint,
      geometry: venueGeometry,
    });
    if (distMeters === null) return false;
    return distMeters <= radiusMeters;
  }
}

export { StopGeometry };
export type { VenueGeometry };
