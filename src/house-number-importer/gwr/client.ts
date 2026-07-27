import {
  httpGetJson,
  IDENTIFY_URL,
  PAGE_SIZE,
  RateLimiter,
  rateLimiter,
} from "../../geoadmin/http";
import type { Bbox } from "../../geoadmin/types";
import { log } from "../log";
import { DEFAULT_PARSE_OPTIONS, dedupePoints, parseGwrFeature, type ParseOptions } from "./parse";
import type { GwrPoint } from "./types";

const LAYER_ID = "ch.bfs.gebaeude_wohnungs_register";
/**
 * 8 pages = 1600 addresses per tile. Measured in central Zurich a 0.005° tile holds ~170
 * addresses, so the cap leaves an eightfold margin. The reference userscript sent no paging
 * at all and silently lost everything past the API's ~200-result default page.
 */
const MAX_PAGES_PER_TILE = 8;

export interface FetchGwrResult {
  points: GwrPoint[];
  /** True when the page cap was hit: addresses are missing for this bbox. */
  truncated: boolean;
}

interface IdentifyResponse {
  results?: unknown[];
}

/**
 * Fetch every address point intersecting the bbox (WGS84), paging through the identify
 * endpoint until a short page comes back. `truncated` is returned rather than merely
 * logged: a missing address reads as a house number the editor believes is absent, and
 * that is exactly how duplicates get created.
 */
export async function fetchGwrPoints(
  bbox: Bbox,
  signal?: AbortSignal,
  limiter: RateLimiter = rateLimiter,
  parseOptions: ParseOptions = DEFAULT_PARSE_OPTIONS,
): Promise<FetchGwrResult> {
  const points: GwrPoint[] = [];
  for (let page = 0; page < MAX_PAGES_PER_TILE; page++) {
    await limiter.acquire();
    if (signal?.aborted) throw new DOMException("Fetch aborted", "AbortError");
    const params = new URLSearchParams({
      geometryType: "esriGeometryEnvelope",
      geometry: bbox.join(","),
      sr: "4326",
      layers: `all:${LAYER_ID}`,
      tolerance: "0",
      // The geojson geometry is the entrance point (dkode/dkodn), which is where a house
      // number belongs; the building centroid sits a median 5 m away, up to 39 m.
      returnGeometry: "true",
      geometryFormat: "geojson",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const data = (await httpGetJson(
      `${IDENTIFY_URL}?${params.toString()}`,
      signal,
    )) as IdentifyResponse;
    const results = data.results ?? [];
    for (const result of results) {
      const point = parseGwrFeature(result, parseOptions);
      if (point) points.push(point);
    }
    if (results.length < PAGE_SIZE) return { points: dedupePoints(points), truncated: false };
  }
  log.warn(`Page cap (${MAX_PAGES_PER_TILE}) reached for bbox ${bbox.join(",")}; results truncated`);
  return { points: dedupePoints(points), truncated: true };
}
