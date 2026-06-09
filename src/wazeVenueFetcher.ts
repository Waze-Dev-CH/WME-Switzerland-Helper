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
  private getApiBaseUrl(args: { wmeSDK: WmeSDK }): string {
    // Data-server prefix is {host}/{regionCode}-Descartes. "Descartes" is the
    // ROW data server; getRegionCode() is "row" for Swiss editors. Host depends
    // on the beta vs production environment.
    const host = args.wmeSDK.isBetaEnvironment()
      ? "https://beta.waze.com"
      : "https://www.waze.com";
    const region = args.wmeSDK.Settings.getRegionCode() ?? "row";
    return `${host}/${region}-Descartes`;
  }

  // Fetches transport venues for a single bbox. The Features API caps the
  // number of venues per request, so the caller queries a grid of small cells
  // (one call each) rather than one large viewport request — otherwise
  // transport stops get crowded out of the capped result on a wide extent.
  async fetchVenuesForBbox(args: {
    wmeSDK: WmeSDK;
    bbox: [number, number, number, number];
  }): Promise<VenueLike[]> {
    const apiBaseUrl = this.getApiBaseUrl({ wmeSDK: args.wmeSDK });
    const [x1, y1, x2, y2] = args.bbox;
    const bbox = `${x1},${y1},${x2},${y2}`;
    const url = `${apiBaseUrl}/app/Features?bbox=${encodeURIComponent(bbox)}&v=2&apiV2=true&venueLevel=4`;

    let response;
    try {
      response = await GM.xmlHttpRequest({
        method: "GET",
        url,
        responseType: "json",
      });
    } catch (error) {
      console.warn("[WazeVenueFetcher] Request failed:", error);
      return [];
    }

    if (response.status !== 200) {
      console.warn(`[WazeVenueFetcher] API returned ${response.status}`);
      return [];
    }

    // GM.xmlHttpRequest may leave responseType "json" unparsed depending on
    // the manager — fall back to parsing responseText.
    let data = response.response as WazeApiResponse | string | null;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data) as WazeApiResponse;
      } catch {
        data = null;
      }
    }

    const objects = (data as WazeApiResponse)?.venues?.objects ?? [];

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
