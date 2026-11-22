import { describe, expect, it } from "vitest";
import { makeOfficial } from "../fixtures/swiss-names";
import {
  raisesCase,
  resolveOfficialCase,
  sameUpToOfficialCase,
  writesNamesInCapitals,
} from "./official-case";

// Register spellings below are real Geneva entries of ch.swisstopo.amtliches-strassenverzeichnis.

describe("writesNamesInCapitals", () => {
  it("is true for a Geneva commune and false elsewhere", () => {
    expect(writesNamesInCapitals(makeOfficial("Rue SCHAUB", { comFosnr: 6621 }))).toBe(true);
    expect(writesNamesInCapitals(makeOfficial("Bahnhofplatz SBB", { comFosnr: 261 }))).toBe(false);
  });
});

describe("sameUpToOfficialCase", () => {
  it("accepts a family name the register writes in capitals", () => {
    expect(sameUpToOfficialCase("Rue Schaub", "Rue SCHAUB")).toBe(true);
    expect(sameUpToOfficialCase("Avenue Giuseppe-Motta", "Avenue Giuseppe-MOTTA")).toBe(true);
  });

  it("does not accept the capitals themselves, they are the register's convention", () => {
    expect(sameUpToOfficialCase("Rue SCHAUB", "Rue SCHAUB")).toBe(false);
  });

  it("refuses a family name written all in lowercase", () => {
    expect(sameUpToOfficialCase("Rue schaub", "Rue SCHAUB")).toBe(false);
  });

  it("keeps the strict comparison on words the register does not shout", () => {
    expect(sameUpToOfficialCase("rue Schaub", "Rue SCHAUB")).toBe(false);
  });

  it("leaves the case of a particle open, the register cannot tell it", () => {
    expect(sameUpToOfficialCase("Rue Micheli-du-Crest", "Rue MICHELI-DU-CREST")).toBe(true);
    expect(sameUpToOfficialCase("Rue François-Le-Fort", "Rue François-LE-FORT")).toBe(true);
  });

  it("treats an elided letter before a shouted name as a particle", () => {
    expect(sameUpToOfficialCase("Boulevard d'Yvoy", "Boulevard D'YVOY")).toBe(true);
  });

  it("keeps acronyms strict", () => {
    expect(sameUpToOfficialCase("Plage de l'Onu", "Plage de l'ONU")).toBe(false);
  });

  it("still reports a typographic difference next to a shouted word", () => {
    // en dash instead of hyphen: a real cosmetic fix, not a case question
    expect(sameUpToOfficialCase("Avenue Giuseppe–Motta", "Avenue Giuseppe-MOTTA")).toBe(false);
  });

  it("handles accented capitals", () => {
    expect(
      sameUpToOfficialCase("Terrasse Agrippa-d'Aubigné", "Terrasse Agrippa-D'AUBIGNÉ"),
    ).toBe(true);
  });
});

describe("resolveOfficialCase", () => {
  it("writes a shouted family name in title case", () => {
    expect(resolveOfficialCase("Rue SCHAUB", null)).toEqual({ name: "Rue Schaub", certain: true });
    expect(resolveOfficialCase("Rue Albert-GOS", null)).toEqual({
      name: "Rue Albert-Gos",
      certain: true,
    });
    expect(resolveOfficialCase("Avenue De-BUDÉ", null)).toEqual({
      name: "Avenue De-Budé",
      certain: true,
    });
  });

  it("leaves a name without shouted words untouched", () => {
    expect(resolveOfficialCase("Chemin de l'Église", null)).toEqual({
      name: "Chemin de l'Église",
      certain: true,
    });
  });

  it("takes a particle's case from the Waze name when it has the same word", () => {
    expect(resolveOfficialCase("Rue MICHELI-DU-CREST", "Rue Micheli-du-Cret")).toEqual({
      name: "Rue Micheli-du-Crest",
      certain: true,
    });
    expect(resolveOfficialCase("Boulevard D'YVOY", "Bd d'Yvoy")).toEqual({
      name: "Boulevard d'Yvoy",
      certain: true,
    });
  });

  it("keeps a particle it cannot resolve in capitals and says so", () => {
    expect(resolveOfficialCase("Rue MICHELI-DU-CREST", null)).toEqual({
      name: "Rue Micheli-DU-Crest",
      certain: false,
    });
    expect(resolveOfficialCase("Terrasse Agrippa-D'AUBIGNÉ", null)).toEqual({
      name: "Terrasse Agrippa-D'Aubigné",
      certain: false,
    });
  });

  it("does not take a particle's case from a Waze name in capitals", () => {
    expect(resolveOfficialCase("Rue MICHELI-DU-CREST", "Rue MICHELI-DU-CREST")).toEqual({
      name: "Rue Micheli-DU-Crest",
      certain: false,
    });
  });

  it("keeps acronyms and Roman numerals as written", () => {
    expect(resolveOfficialCase("Plage de l'ONU", null)).toEqual({
      name: "Plage de l'ONU",
      certain: true,
    });
    expect(resolveOfficialCase("Rue Pie-XII", null)).toEqual({ name: "Rue Pie-XII", certain: true });
  });
});

describe("raisesCase", () => {
  it("is true when a word of the current name would turn into capitals", () => {
    expect(raisesCase("Rue Schaub", "Rue SCHAUB")).toBe(true);
    expect(raisesCase("Route de la Step", "Route de la STEP")).toBe(true);
  });

  it("is false when the word is already in capitals", () => {
    expect(raisesCase("Rte de la STEP", "Route de la STEP")).toBe(false);
  });

  it("is false for a word the current name does not have", () => {
    expect(raisesCase(null, "Route de la STEP")).toBe(false);
    expect(raisesCase("Route de la Gare", "Route de la STEP")).toBe(false);
  });

  it("is false when capitals are lowered or untouched", () => {
    expect(raisesCase("Rue SCHAUB", "Rue Schaub")).toBe(false);
    expect(raisesCase("Av. de Florimont", "Avenue de Florimont")).toBe(false);
  });
});
