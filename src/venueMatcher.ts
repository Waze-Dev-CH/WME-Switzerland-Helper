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

import { point } from "@turf/turf";
import { StopGeometry, type VenueGeometry } from "./stopGeometry";

interface VenueLike {
  id: string | number;
  name: string;
  categories: string[];
  geometry: VenueGeometry;
}

class VenueMatcher {
  private readonly stopGeometry: StopGeometry;

  constructor() {
    this.stopGeometry = new StopGeometry();
  }

  // Candidate venues for a stop: same category and within radius. Name is
  // intentionally ignored so a renamed stop still matches its existing venue
  // (same location/type) and can be offered as an update rather than a new POI.
  findMatchingVenues(args: {
    venues: VenueLike[];
    stopLon: number;
    stopLat: number;
    categories: string[];
    radiusMeters: number;
  }): VenueLike[] {
    const { venues, stopLon, stopLat, categories, radiusMeters } = args;

    const stopPoint = point([stopLon, stopLat]);

    return venues.filter((venue) => {
      const hasMatchingCategory = venue.categories.some((cat) =>
        categories.includes(cat),
      );
      if (!hasMatchingCategory) return false;

      return this.stopGeometry.isWithinRadius({
        stopPoint,
        venueGeometry: venue.geometry,
        radiusMeters,
      });
    });
  }

  hasExactMatch(args: {
    venues: VenueLike[];
    stopLon: number;
    stopLat: number;
    stopName: string;
    categories: string[];
  }): boolean {
    const { venues, stopLon, stopLat, stopName, categories } = args;
    const stopPoint = point([stopLon, stopLat]);

    return venues.some((v) => {
      if (v.name !== stopName) return false;

      const hasMatchingCategory = v.categories.some((cat) =>
        categories.includes(cat),
      );
      if (!hasMatchingCategory) return false;

      return this.stopGeometry.isWithinRadius({
        stopPoint,
        venueGeometry: v.geometry,
        radiusMeters: 75,
      });
    });
  }
}

export { VenueMatcher };
export type { VenueLike };
