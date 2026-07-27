import {
  httpGetJson,
  IDENTIFY_URL,
  PAGE_SIZE,
  RateLimiter,
  rateLimiter,
} from "../../geoadmin/http";
import { log } from "../log";
import type { Bbox, OfficialStreet } from "./types";

const BASE_URL = IDENTIFY_URL;
const LAYER_ID = "ch.swisstopo.amtliches-strassenverzeichnis";
const MAX_PAGES_PER_TILE = 15;

interface IdentifyResponse {
  results?: Array<{
    /** Esri format (no geometryFormat param). */
    attributes?: Record<string, unknown>;
    /** GeoJSON format (geometryFormat=geojson) puts the fields here instead. */
    properties?: Record<string, unknown>;
    geometry?: unknown;
  }>;
}

interface GeoJsonLike {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJsonLike[];
}

/**
 * Extract line geometries (street axes). Real register data mixes
 * MultiLineString, GeometryCollection of MultiLineStrings, and MultiPolygon
 * (named areas) - polygons are dropped on purpose.
 */
export function extractLines(geometry: unknown): number[][][] | null {
  const g = geometry as GeoJsonLike | undefined;
  if (!g || typeof g !== "object") return null;
  switch (g.type) {
    case "LineString":
      return Array.isArray(g.coordinates) ? [g.coordinates as number[][]] : null;
    case "MultiLineString":
      return Array.isArray(g.coordinates) ? (g.coordinates as number[][][]) : null;
    case "GeometryCollection": {
      const lines = (g.geometries ?? []).flatMap((sub) => extractLines(sub) ?? []);
      return lines.length > 0 ? lines : null;
    }
    default:
      return null;
  }
}

export function parseAttributes(
  attrs: Record<string, unknown> | undefined,
  geometry?: unknown,
): OfficialStreet | null {
  if (!attrs) return null;
  const esid = Number(attrs["str_esid"]);
  const label = attrs["stn_label"];
  if (typeof label !== "string" || label.trim() === "" || !Number.isFinite(esid)) return null;
  const official = attrs["str_official"];
  return {
    esid,
    label: label.trim(),
    zipLabel: String(attrs["zip_label"] ?? ""),
    comName: String(attrs["com_name"] ?? ""),
    comFosnr: Number(attrs["com_fosnr"] ?? 0),
    official: official === 1 || official === true || official === "true",
    status: String(attrs["str_status"] ?? ""),
    type: String(attrs["str_type"] ?? ""),
    lines: extractLines(geometry),
  };
}

const FIND_URL = "https://api3.geo.admin.ch/rest/services/api/MapServer/find";

/**
 * Nationwide exact-name lookup (case-sensitive), returning the merged axis
 * polylines of every register entry bearing that name. Used to recognize
 * out-of-locality continuations of cantonal/national roads whose register
 * entry belongs to the neighboring commune.
 */
export async function findStreetLinesByName(
  name: string,
  signal?: AbortSignal,
  limiter: RateLimiter = rateLimiter,
): Promise<number[][][] | null> {
  // A frequent name ("Route de Berne") has many nationwide entries; without paging
  // the endpoint truncates to its default page, and if the neighbouring commune's
  // axis is not on it the continuation stays a false NOT_FOUND. Page like
  // fetchOfficialStreets does, stopping on the first short page.
  const lines: number[][][] = [];
  for (let page = 0; page < MAX_PAGES_PER_TILE; page++) {
    await limiter.acquire();
    if (signal?.aborted) throw new DOMException("Scan aborted", "AbortError");
    const params = new URLSearchParams({
      layer: LAYER_ID,
      searchField: "stn_label",
      searchText: name,
      contains: "false",
      returnGeometry: "true",
      geometryFormat: "geojson",
      sr: "4326",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const data = (await httpGetJson(
      `${FIND_URL}?${params.toString()}`,
      signal,
    )) as IdentifyResponse;
    const results = data.results ?? [];
    for (const r of results) lines.push(...(extractLines(r.geometry) ?? []));
    if (results.length < PAGE_SIZE) break;
  }
  return lines.length > 0 ? lines : null;
}

export interface FetchStreetsResult {
  streets: OfficialStreet[];
  /** True when the page cap was hit: register entries are missing for this bbox. */
  truncated: boolean;
}

/**
 * Fetch all official street entries intersecting the bbox (WGS84),
 * paging through the identify endpoint until a short page is returned.
 * `truncated` is surfaced (not just logged) because missing register entries
 * turn into false NOT_FOUND verdicts downstream.
 */
export async function fetchOfficialStreets(
  bbox: Bbox,
  signal?: AbortSignal,
  limiter: RateLimiter = rateLimiter,
): Promise<FetchStreetsResult> {
  const out: OfficialStreet[] = [];
  for (let page = 0; page < MAX_PAGES_PER_TILE; page++) {
    await limiter.acquire();
    if (signal?.aborted) throw new DOMException("Scan aborted", "AbortError");
    const params = new URLSearchParams({
      geometryType: "esriGeometryEnvelope",
      geometry: bbox.join(","),
      sr: "4326",
      layers: `all:${LAYER_ID}`,
      tolerance: "0",
      // Geometries are always fetched (measured ~400 KB on the densest
      // Lausanne tile) so the tile cache stays coherent whatever the
      // geometry-matching setting; evaluation decides whether to use them.
      returnGeometry: "true",
      geometryFormat: "geojson",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const data = (await httpGetJson(`${BASE_URL}?${params.toString()}`, signal)) as IdentifyResponse;
    const results = data.results ?? [];
    for (const r of results) {
      const street = parseAttributes(r.properties ?? r.attributes, r.geometry);
      if (street) out.push(street);
    }
    if (results.length < PAGE_SIZE) return { streets: out, truncated: false };
  }
  log.warn(`Page cap (${MAX_PAGES_PER_TILE}) reached for bbox ${bbox.join(",")}; results truncated`);
  return { streets: out, truncated: true };
}
