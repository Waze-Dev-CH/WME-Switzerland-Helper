/**
 * One address point of the Swiss building and dwelling register (RegBL/GWR),
 * layer `ch.bfs.gebaeude_wohnungs_register`.
 */
export interface GwrPoint {
  /** `${egid}:${edid}` (building:entrance), falling back to coordinates when absent. */
  id: string;
  /** House number as printed (deinr): "15", "15a", "15-17". */
  number: string;
  /**
   * Every name the register carries for the street (strname). Bilingual communes list
   * both, e.g. ["Rue Centrale", "Zentralstrasse"], so matching must try all of them.
   */
  streetNames: string[];
  /** Federal street id (esid), shared by every point of the same street axis. */
  esid: number;
  /** WGS84. The API's GeoJSON geometry is the entrance point, not the building centroid. */
  lon: number;
  lat: number;
  /** doffadr === 1: the building's official address rather than a secondary entrance. */
  officialAddress: boolean;
}

/** Building status (gstat): the only value meaning "built and standing". */
export const GSTAT_EXISTING = 1004;
