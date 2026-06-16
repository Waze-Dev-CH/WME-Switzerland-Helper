import { log } from "../log";
import type { Bbox, OfficialStreet } from "./types";

const BASE_URL = "https://api3.geo.admin.ch/rest/services/api/MapServer/identify";
const LAYER_ID = "ch.swisstopo.amtliches-strassenverzeichnis";
const PAGE_SIZE = 200; // documented maximum of the identify endpoint
const MAX_PAGES_PER_TILE = 15;
const MAX_REQUESTS_PER_MINUTE = 30; // stay under the 40 req/min fair-use limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sliding-window rate limiter; acquire() resolves when a request slot is free. */
export class RateLimiter {
  private stamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(private maxPerMinute = MAX_REQUESTS_PER_MINUTE) {}

  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      let now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < 60_000);
      if (this.stamps.length >= this.maxPerMinute) {
        const oldest = this.stamps[0] ?? now;
        await sleep(Math.max(0, oldest + 60_000 - now));
        now = Date.now();
        this.stamps = this.stamps.filter((t) => now - t < 60_000);
      }
      this.stamps.push(Date.now());
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export const rateLimiter = new RateLimiter();

function gmGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "json",
      onload: (r) =>
        r.status >= 200 && r.status < 300
          ? resolve(r.response)
          : reject(new Error(`geo.admin.ch HTTP ${r.status}`)),
      onerror: () => reject(new Error("GM_xmlhttpRequest network error")),
      ontimeout: () => reject(new Error("GM_xmlhttpRequest timeout")),
    });
  });
}

async function httpGetJson(url: string, signal?: AbortSignal): Promise<unknown> {
  // In WME the page Content-Security-Policy blocks `fetch()` to api3.geo.admin.ch
  // (it is not in `connect-src`); GM_xmlhttpRequest runs in the extension context and
  // bypasses it, so prefer it whenever Tampermonkey provides it. `fetch()` is kept for
  // environments without GM (unit tests / Node).
  if (typeof GM_xmlhttpRequest === "function") return gmGetJson(url);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geo.admin.ch HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

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
  });
  const data = (await httpGetJson(`${FIND_URL}?${params.toString()}`, signal)) as IdentifyResponse;
  const lines = (data.results ?? []).flatMap((r) => extractLines(r.geometry) ?? []);
  return lines.length > 0 ? lines : null;
}

/**
 * Fetch all official street entries intersecting the bbox (WGS84),
 * paging through the identify endpoint until a short page is returned.
 */
export async function fetchOfficialStreets(
  bbox: Bbox,
  signal?: AbortSignal,
  limiter: RateLimiter = rateLimiter,
): Promise<OfficialStreet[]> {
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
    if (results.length < PAGE_SIZE) return out;
  }
  log.warn(`Page cap (${MAX_PAGES_PER_TILE}) reached for bbox ${bbox.join(",")}; results truncated`);
  return out;
}
