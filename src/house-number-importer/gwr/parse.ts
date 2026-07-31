import { GSTAT_EXISTING, type GwrPoint } from "./types";

export interface ParseOptions {
  /** Drop addresses of buildings that are planned, authorized or still under construction. */
  existingBuildingsOnly: boolean;
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = { existingBuildingsOnly: true };

/**
 * Swiss sub-entry numbers ("15.1", "15a.1") identify an entrance or a dwelling inside a
 * building, not a house number. They are always dropped: importing them would bury the
 * real numbers under unusable near-duplicates.
 */
export function isSubEntryNumber(value: string): boolean {
  return /^\d+[A-Za-z]*\.\d+$/.test(value.trim());
}

/** `strname` is an array in bilingual communes and a plain string elsewhere. */
export function parseStreetNames(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  const names: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readPoint(geometry: unknown): { lon: number; lat: number } | null {
  const geom = asRecord(geometry);
  if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates)) return null;
  const [lon, lat] = geom.coordinates as unknown[];
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
}

/** Fallback when `strname`/`deinr` are missing: "Rue Exemple 15a" splits into both. */
const COMBINED = /^(.*?)[\s,]+(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)$/;

function splitCombined(value: unknown): { street: string; number: string } | null {
  if (typeof value !== "string") return null;
  const match = COMBINED.exec(value.trim());
  return match ? { street: match[1].trim(), number: match[2].trim() } : null;
}

/**
 * Turn one `identify` result into an address point, or null when it carries no usable
 * house number. Reads `properties` (geojson format) or `attributes` (Esri format): the
 * checker already shipped a release that silently stored empty tiles by assuming one.
 */
export function parseGwrFeature(
  raw: unknown,
  options: ParseOptions = DEFAULT_PARSE_OPTIONS,
): GwrPoint | null {
  const feature = asRecord(raw);
  if (!feature) return null;
  const props = asRecord(feature.properties) ?? asRecord(feature.attributes);
  if (!props) return null;

  // Only reject on a status actually read: were the field ever dropped from the API,
  // treating "missing" as "not built" would silently empty the map.
  const status = props.gstat;
  const statusKnown = status !== undefined && status !== null;
  if (options.existingBuildingsOnly && statusKnown && Number(status) !== GSTAT_EXISTING) {
    return null;
  }

  const coordinates = readPoint(feature.geometry);
  if (!coordinates) return null;

  const combined = splitCombined(props.strname_deinr);
  const rawNumber = props.deinr;
  let number =
    typeof rawNumber === "string" || typeof rawNumber === "number" ? String(rawNumber).trim() : "";
  if (number === "" && combined) number = combined.number;
  if (number === "" || isSubEntryNumber(number)) return null;

  let streetNames = parseStreetNames(props.strname);
  if (streetNames.length === 0 && combined) streetNames = [combined.street];
  if (streetNames.length === 0) return null;

  const esid = Number(props.esid);
  const egid = props.egid;
  const hasBuildingId = egid !== undefined && egid !== null && String(egid) !== "";
  const id = hasBuildingId
    ? `${String(egid)}:${String(props.edid ?? 0)}`
    : `${coordinates.lon.toFixed(6)}:${coordinates.lat.toFixed(6)}:${number}`;

  return {
    id,
    number,
    streetNames,
    esid: Number.isFinite(esid) ? esid : 0,
    lon: coordinates.lon,
    lat: coordinates.lat,
    officialAddress: Number(props.doffadr) === 1,
  };
}

/**
 * A building with several entrances yields several results carrying the same number.
 * Keep one per (street, number), preferring the official address.
 */
export function dedupePoints(points: GwrPoint[]): GwrPoint[] {
  const byKey = new Map<string, GwrPoint>();
  for (const point of points) {
    const key = `${point.esid}|${point.number.toUpperCase()}`;
    const kept = byKey.get(key);
    if (!kept || (!kept.officialAddress && point.officialAddress)) byKey.set(key, point);
  }
  return [...byKey.values()];
}
