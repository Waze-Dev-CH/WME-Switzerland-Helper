import type { LineString } from "geojson";
import { wgs84ToLv95 } from "./geoadmin/links";
import { foldAccents } from "./matching/normalize";
import { samplePoints } from "./matching/spatial";

/**
 * Open a segment's location on the relevant cantonal geoportal. WME gives the
 * canton via `address.state.name` (no abbreviation), so we map that name —
 * across languages, case and accents — to a canton code, then build a recenter
 * permalink. All cantonal portals expect LV95 (EPSG:2056) coordinates.
 *
 * Coverage is incremental: a canton needs both a name entry and a URL builder
 * to get a button; unknown cantons simply get no button.
 */

/** Normalized name variants (lowercase, accents folded) -> canton code, all 26. */
const NAME_VARIANTS: Record<string, string[]> = {
  zh: ["zurich"],
  be: ["bern", "berne", "berna"],
  lu: ["luzern", "lucerne", "lucerna"],
  ur: ["uri"],
  sz: ["schwyz", "svitto"],
  ow: ["obwalden", "obwald", "obvaldo"],
  nw: ["nidwalden", "nidwald", "nidvaldo"],
  gl: ["glarus", "glaris", "glarona"],
  zg: ["zug", "zoug", "zugo"],
  fr: ["fribourg", "freiburg", "friburgo"],
  so: ["solothurn", "soleure", "soletta"],
  bs: ["basel-stadt", "basel stadt", "bale-ville", "bale ville", "basilea citta"],
  bl: ["basel-landschaft", "basel landschaft", "bale-campagne", "bale campagne", "basilea campagna"],
  sh: ["schaffhausen", "schaffhouse", "sciaffusa"],
  ar: ["appenzell ausserrhoden", "appenzell rhodes-exterieures", "appenzello esterno"],
  ai: ["appenzell innerrhoden", "appenzell rhodes-interieures", "appenzello interno"],
  sg: ["st. gallen", "st gallen", "sankt gallen", "saint-gall", "saint gall", "san gallo"],
  gr: ["graubunden", "grisons", "grigioni", "grischun"],
  ag: ["aargau", "argovie", "argovia"],
  tg: ["thurgau", "thurgovie", "turgovia"],
  ti: ["ticino", "tessin"],
  vd: ["vaud", "waadt"],
  vs: ["valais", "wallis", "vallese"],
  ne: ["neuchatel", "neuenburg"],
  ge: ["geneve", "geneva", "genf", "ginevra"],
  ju: ["jura", "giura"],
};

const NAME_TO_CODE = new Map<string, string>();
for (const [code, names] of Object.entries(NAME_VARIANTS)) {
  for (const name of names) NAME_TO_CODE.set(name, code);
}

function normalizeName(name: string): string {
  return foldAccents(name).toLowerCase().trim().replace(/\s+/g, " ");
}

export function cantonCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const direct = NAME_TO_CODE.get(normalizeName(name));
  if (direct) return direct;
  // Bilingual cantons (FR, VS, GR…) may arrive as "Fribourg / Freiburg".
  for (const part of name.split("/")) {
    const code = NAME_TO_CODE.get(normalizeName(part));
    if (code) return code;
  }
  return null;
}

/**
 * LV95 point URL builders per canton, keyed by code. E/N are LV95. Each entry is
 * verified live (permalink.js source, or the documented GeoMapFish scheme proven
 * by NE). Cantons whose recenter scheme could not be confirmed are intentionally
 * absent (no button) — they stay recognised in NAME_TO_CODE so they can be added
 * once verified. See the cantonal-geoportal notes in the plan.
 */
const MAP_URL: Record<string, (e: number, n: number) => string> = {
  // VD — new geoportail.vd.ch viewer. Hybrid basemap + the mobility theme
  // (arrondissements, cantonal road hierarchy, railway lines, locality crossings).
  // visiblelayers is a constant JSON blob with braces/accents → encode it once
  // (see VD_VISIBLE_LAYERS below).
  vd: (e, n) =>
    `https://www.geoportail.vd.ch/map.htm?center=${r(e)},${r(n)}&scale=2000&wkid=2056` +
    `&theme=hybride&mapresources=DGMR_PUBLIC,GEO_THEME_MOBIL&hidden=GEO_THEME_MOBIL` +
    `&visiblelayers=${VD_VISIBLE_LAYERS}`,
  // GeoMapFish (map_x/map_y/map_zoom + crosshair) — recenter confirmed live.
  // JU (geo.jura.ch) and GR (map.geo.gr.ch) are intentionally absent: JU's portal
  // returns errors / closes the connection, and GR forcibly redirects to its parcel
  // theme and resets the zoom to the whole canton — neither recenters usably.
  ne: (e, n) => geomapfish("https://sitn.ne.ch/", e, n),
  sz: (e, n) => geomapfish("https://map.geo.sz.ch/", e, n),
  ti: (e, n) => geomapfish("https://map.geo.ti.ch/", e, n),
  bl: (e, n) => geomapfish("https://geoview.bl.ch/", e, n),
  // GE — Topomat/ESRI viewer (center,scale found in JS).
  ge: (e, n) => centerScale("https://map.sitg.ge.ch/app/", e, n),
  // Canton-specific schemes.
  be: (e, n) =>
    `https://www.topo.apps.be.ch/pub/map/?center=${r(e)},${r(n)}&scale=2000&addcrosshair=true`,
  so: (e, n) => `https://geo.so.ch/map?c=${r(e)},${r(n)}&s=2000&hc=1`,
};

// VD geoportail.vd.ch mobility-theme layers to show. Constant JSON with braces and
// accented names → percent-encode once so the generated href stays valid.
const VD_VISIBLE_LAYERS = encodeURIComponent(
  JSON.stringify({
    GEO_THEME_MOBIL: [
      "Arrondissements",
      "Hiérarchie des routes cantonales",
      "Lignes ferroviaires, par compagnies",
      "Traversées de localités",
    ],
  }),
);

const r = (v: number) => Math.round(v);
function geomapfish(base: string, e: number, n: number): string {
  return `${base}?map_x=${r(e)}&map_y=${r(n)}&map_zoom=8&map_crosshair=true`;
}
function centerScale(base: string, e: number, n: number): string {
  return `${base}?center=${r(e)},${r(n)}&scale=2000`;
}

export function cantonMapUrl(
  stateName: string | null | undefined,
  lon: number,
  lat: number,
): string | null {
  const code = cantonCodeFromName(stateName);
  if (!code) return null;
  const build = MAP_URL[code];
  if (!build) return null;
  const { e, n } = wgs84ToLv95(lon, lat);
  return build(e, n);
}

export function cantonMapUrlForGeometry(
  geometry: LineString,
  stateName: string | null | undefined,
): string | null {
  const points = samplePoints(geometry);
  // No geometry ⇒ no button, rather than a [0,0] fallback that builds a valid-looking
  // cantonal link pointing to LV95 (0,0) — far outside Switzerland.
  if (points.length === 0) return null;
  const mid = points[Math.floor(points.length / 2)] as number[];
  return cantonMapUrl(stateName, mid[0] as number, mid[1] as number);
}
