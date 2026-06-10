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

import { cleanStopName } from "./stopNameCleaner";

interface TransportStop {
  designationofficial?: string;
  designation?: string;
  localityname: string;
  businessorganisationabbreviationde: string;
  businessorganisationdescriptionde: string;
  meansoftransport: string;
}

interface NameResult {
  name: string;
  aliases: string[];
  shortName: string;
}

class StopNameFormatter {
  private readonly venueInnerTypeMapping: Map<string, string>;
  private readonly defaultVenueInnerType: string;

  constructor() {
    this.venueInnerTypeMapping = new Map();
    this.defaultVenueInnerType = "arrêt";
    this.venueInnerTypeMapping.set("TRAIN", "gare");
    this.venueInnerTypeMapping.set("BOAT", "port");
    this.venueInnerTypeMapping.set("CHAIRLIFT", "remontée mécanique");
    this.venueInnerTypeMapping.set("CABLE_RAILWAY", "station de funiculaire");
  }

  private meansOfTransport(meansoftransport: string): string[] {
    return meansoftransport.split("|");
  }

  private getVenueInnerType(meansoftransport: string): string {
    const means = this.meansOfTransport(meansoftransport);
    return means
      .map(
        (mean) =>
          this.venueInnerTypeMapping.get(mean) || this.defaultVenueInnerType,
      )
      .join(", ");
  }

  private normalizeOrganization(
    abbreviation: string,
    fullName: string,
  ): { abbreviation: string; fullName: string } {
    const abbrevLower = abbreviation.toLowerCase();

    if (abbrevLower === "sbb") {
      return {
        abbreviation: "CFF",
        fullName: "Chemins de fer fédéraux CFF",
      };
    }

    if (
      [
        "trn/tc",
        "trn/autovr",
        "trn/autrvt",
        "trn-tn",
        "trn-cmn",
        "trn-rvt",
      ].includes(abbrevLower)
    ) {
      return {
        abbreviation: "transN",
        fullName: "Transports Publics Neuchâtelois SA",
      };
    }

    if (abbrevLower === "pag") {
      return {
        abbreviation: "",
        fullName: "CarPostal SA",
      };
    }

    return { abbreviation, fullName };
  }

  formatName(stop: TransportStop): NameResult {
    const rawName = stop.designationofficial || stop.designation || "Bus Stop";
    const cleanedName = cleanStopName(rawName, stop.localityname);
    const venueInnerType = this.getVenueInnerType(stop.meansoftransport);

    const { abbreviation, fullName } = this.normalizeOrganization(
      stop.businessorganisationabbreviationde,
      stop.businessorganisationdescriptionde,
    );

    const aliases: string[] = [];
    const shortName = cleanedName;

    if (stop.businessorganisationabbreviationde.toLowerCase() === "sbb") {
      aliases.push(
        `${cleanedName} (${venueInnerType} ${stop.businessorganisationdescriptionde})`,
      );
      aliases.push(
        `${cleanedName} (${venueInnerType} ${stop.businessorganisationabbreviationde})`,
      );
    }

    if (abbreviation !== "") {
      aliases.push(`${cleanedName} (${venueInnerType} ${fullName})`);
      return {
        name: `${cleanedName} (${venueInnerType} ${abbreviation})`,
        aliases,
        shortName,
      };
    }

    return {
      name: `${cleanedName} (${venueInnerType} ${fullName})`,
      aliases,
      shortName,
    };
  }
}

export { StopNameFormatter };
export type { NameResult };
