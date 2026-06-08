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
