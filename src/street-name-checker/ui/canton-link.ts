import type { LineString } from "geojson";
import { cantonCodeFromName, cantonMapUrlForGeometry } from "../canton-map";
import { t } from "../i18n";
import { CANTON_FLAGS as FLAGS } from "./canton-flags";

/**
 * Build a link that opens the segment's location on the relevant cantonal
 * geoportal (sibling of the map.geo.admin.ch "↗" link). Shows the canton flag
 * when bundled, otherwise the 2-letter code. Returns null when the canton is
 * unknown or has no configured map (caller skips the button).
 */
export function cantonMapLink(
  geometry: LineString,
  cantonName: string | null,
): HTMLAnchorElement | null {
  const url = cantonMapUrlForGeometry(geometry, cantonName);
  const code = cantonCodeFromName(cantonName);
  if (!url || !code) return null;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.title = t("cantonMapLinkTitle", { canton: code.toUpperCase() });

  const flag = FLAGS[code];
  if (flag) {
    a.className = "chk-canton-link";
    const img = document.createElement("img");
    img.className = "chk-canton-flag";
    img.src = flag;
    img.alt = code.toUpperCase();
    a.appendChild(img);
  } else {
    a.className = "chk-canton-link chk-canton-badge";
    a.textContent = code.toUpperCase();
  }
  return a;
}
