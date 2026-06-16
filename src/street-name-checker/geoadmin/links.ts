import type { LineString } from "geojson";
import type { LocaleCode } from "../i18n";
import { samplePoints } from "../matching/spatial";

/**
 * WGS84 -> LV95 (CH1903+), swisstopo approximate formulas (~1 m accuracy),
 * good enough to center a map permalink.
 */
export function wgs84ToLv95(lon: number, lat: number): { e: number; n: number } {
  const phi = (lat * 3600 - 169_028.66) / 10_000;
  const lambda = (lon * 3600 - 26_782.5) / 10_000;
  const e =
    2_600_072.37 +
    211_455.93 * lambda -
    10_938.51 * lambda * phi -
    0.36 * lambda * phi * phi -
    44.54 * lambda * lambda * lambda;
  const n =
    1_200_147.07 +
    308_807.95 * phi +
    3_745.25 * lambda * lambda +
    76.63 * phi * phi -
    194.56 * lambda * lambda * phi +
    119.79 * phi * phi * phi;
  return { e, n };
}

const REGISTER_LAYER = "ch.swisstopo.amtliches-strassenverzeichnis";

/** Permalink to map.geo.admin.ch centered on the point, register layer enabled. */
export function mapGeoAdminUrl(lon: number, lat: number, locale: LocaleCode): string {
  const { e, n } = wgs84ToLv95(lon, lat);
  const params = new URLSearchParams({
    lang: locale,
    E: e.toFixed(1),
    N: n.toFixed(1),
    zoom: "11",
    layers: REGISTER_LAYER,
  });
  return `https://map.geo.admin.ch/?${params.toString()}`;
}

/** Permalink for the middle of a segment geometry. */
export function mapGeoAdminUrlForGeometry(geometry: LineString, locale: LocaleCode): string {
  const points = samplePoints(geometry);
  const mid = points[Math.floor(points.length / 2)] ?? [0, 0];
  return mapGeoAdminUrl(mid[0] as number, mid[1] as number, locale);
}
