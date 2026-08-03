/**
 * Disc markers as base64 data URIs, the same idiom the public transport stops already use
 * (`generateStopSvg` in src/publicTransportStopsLayer.ts): the SDK draws a point from an
 * `externalGraphic`, and Rollup has no SVG asset loader in this setup, so the markup has
 * to be inline. The same URI feeds the map and the legend pill in the tab, which is what
 * keeps the two from ever drifting apart.
 */

/** White pictogram drawn over the disc. Stroked rather than filled: far shorter paths. */
export type Glyph = "plus" | "check";

const GLYPH_PATHS: Record<Glyph, string> = {
  plus: "M24 14v20M14 24h20",
  check: "M15 24.5l6.5 6.5L33 19",
};

export interface IconSpec {
  color: string;
  /** Carried by the <svg> root, so the map point and the legend pill fade together. */
  opacity: number;
  glyph?: Glyph;
}

/**
 * `btoa` only encodes Latin-1, so every character in the markup below has to stay ASCII.
 * A literal check mark here would throw at runtime instead of failing the build, which is
 * why the pictograms are paths and not text.
 */
export function statusIcon({ color, opacity, glyph }: IconSpec): string {
  const pictogram = glyph
    ? `<path d="${GLYPH_PATHS[glyph]}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" opacity="${opacity}">` +
    `<circle cx="24" cy="24" r="21" fill="${color}" stroke="#fff" stroke-width="3"/>` +
    `${pictogram}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
