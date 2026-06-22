import type { OfficialStreet } from "../geoadmin/types";

let nextEsid = 10000000;

export function makeOfficial(label: string, overrides: Partial<OfficialStreet> = {}): OfficialStreet {
  return {
    esid: nextEsid++,
    label,
    zipLabel: "1003 Lausanne",
    comName: "Lausanne",
    comFosnr: 5586,
    official: true,
    status: "bestehend",
    type: "Strasse",
    lines: null,
    ...overrides,
  };
}

/** A small Lausanne-like register extract. */
export const LAUSANNE_STREETS: OfficialStreet[] = [
  makeOfficial("Rue du Grand-Pont"),
  makeOfficial("Avenue de Florimont"),
  makeOfficial("Chemin de l'Église"),
  makeOfficial("Avenue du Général-Guisan"),
  makeOfficial("Place Saint-François"),
  makeOfficial("Route de Berne"),
];

/** Bilingual commune extract (Biel/Bienne-style slash labels). */
export const BIEL_STREETS: OfficialStreet[] = [
  makeOfficial("Bielstrasse/Rue de Bienne", {
    zipLabel: "2503 Biel/Bienne",
    comName: "Biel/Bienne",
    comFosnr: 371,
  }),
];

/** German-speaking extract. */
export const BERN_STREETS: OfficialStreet[] = [
  makeOfficial("Bahnhofstrasse", { zipLabel: "3011 Bern", comName: "Bern", comFosnr: 351 }),
  makeOfficial("Zürichstrasse", { zipLabel: "3013 Bern", comName: "Bern", comFosnr: 351 }),
];
