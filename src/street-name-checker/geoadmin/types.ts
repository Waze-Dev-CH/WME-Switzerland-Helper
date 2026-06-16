/** One entry of the official Swiss street register (amtliches Strassenverzeichnis). */
export interface OfficialStreet {
  /** Federal street id (str_esid). */
  esid: number;
  /** Official street name (stn_label). */
  label: string;
  /** ZIP + locality, e.g. "1003 Lausanne" (zip_label). */
  zipLabel: string;
  /** Commune name (com_name). */
  comName: string;
  /** BFS commune number (com_fosnr). */
  comFosnr: number;
  /** Whether the name is marked official (str_official). */
  official: boolean;
  /** Lifecycle status, e.g. "bestehend"/"real" vs planned (str_status). */
  status: string;
  /** Entry type: Strasse/Platz/Benanntes Gebiet (str_type). */
  type: string;
  /**
   * Street axis polylines in WGS84 [lon, lat], extracted from the register
   * geometry (MultiLineString or GeometryCollection). Null for entries without
   * line geometry (named areas are polygons and are deliberately not kept).
   */
  lines: number[][][] | null;
}

/** [minLon, minLat, maxLon, maxLat] in WGS84. */
export type Bbox = [number, number, number, number];
