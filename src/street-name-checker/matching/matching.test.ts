import { describe, expect, it } from "vitest";
import { damerauLevenshtein } from "../matching/distance";
import {
  localityFromZipLabel,
  OfficialIndex,
  otherLanguageLabels,
} from "../matching/official-index";
import { BIEL_STREETS, BERN_STREETS, LAUSANNE_STREETS, makeOfficial } from "../fixtures/swiss-names";

describe("damerauLevenshtein", () => {
  it("computes basic distances", () => {
    expect(damerauLevenshtein("rue", "rue", 2)).toBe(0);
    expect(damerauLevenshtein("rue", "ruee", 2)).toBe(1);
    expect(damerauLevenshtein("rue", "ru", 2)).toBe(1);
    expect(damerauLevenshtein("rue", "rua", 2)).toBe(1);
  });

  it("counts adjacent transposition as 1", () => {
    expect(damerauLevenshtein("florimont", "floriomnt", 2)).toBe(1);
    expect(damerauLevenshtein("ab", "ba", 2)).toBe(1);
  });

  it("early-exits beyond the bound", () => {
    expect(damerauLevenshtein("abcdef", "zzzzzz", 2)).toBe(3);
    expect(damerauLevenshtein("a", "abcdefgh", 2)).toBe(3);
  });
});

describe("localityFromZipLabel", () => {
  it("strips the ZIP prefix and normalizes", () => {
    expect(localityFromZipLabel("1003 Lausanne")).toBe("lausanne");
    expect(localityFromZipLabel("2503 Biel/Bienne")).toBe("biel/bienne");
  });
});

describe("OfficialIndex.lookup cascade", () => {
  const index = new OfficialIndex([...LAUSANNE_STREETS, ...BERN_STREETS]);

  it("exact: K0 match", () => {
    const m = index.lookup("Rue du Grand-Pont");
    expect(m?.level).toBe("exact");
    expect(m?.entry.namePart).toBe("Rue du Grand-Pont");
  });

  it("cosmetic: apostrophe and case", () => {
    expect(index.lookup("chemin de l’église")?.level).toBe("cosmetic");
  });

  it("variant: abbreviation", () => {
    const m = index.lookup("Av. de Florimont");
    expect(m?.level).toBe("variant");
    expect(m?.entry.namePart).toBe("Avenue de Florimont");
  });

  it("variant: missing accent", () => {
    const m = index.lookup("Chemin de l'Eglise");
    expect(m?.level).toBe("variant");
    expect(m?.entry.namePart).toBe("Chemin de l'Église");
  });

  it("variant: missing article", () => {
    const local = new OfficialIndex([makeOfficial("Chemin de la Montaz")]);
    const m = local.lookup("Chemin de Montaz");
    expect(m?.level).toBe("variant");
    expect(m?.entry.namePart).toBe("Chemin de la Montaz");
  });

  it("variant: multi-word abbreviation (Z.I.)", () => {
    const local = new OfficialIndex([makeOfficial("Zone industrielle Champ Cheval")]);
    const m = local.lookup("Z.I. Champ Cheval");
    expect(m?.level).toBe("variant");
    expect(m?.entry.namePart).toBe("Zone industrielle Champ Cheval");
  });

  it("variant: glued German abbreviation", () => {
    const m = index.lookup("Bahnhofstr.");
    expect(m?.level).toBe("variant");
    expect(m?.entry.namePart).toBe("Bahnhofstrasse");
  });

  it("near: single-typo suggestion", () => {
    const m = index.lookup("Avenue de Florimomt");
    expect(m?.level).toBe("near");
    expect(m?.distance).toBe(1);
    expect(m?.entry.namePart).toBe("Avenue de Florimont");
  });

  it("none: unrelated name", () => {
    expect(index.lookup("Rue Inexistante")).toBeNull();
  });

  it("none: too-short names are not fuzzy-matched", () => {
    expect(index.lookup("Ru")).toBeNull();
  });
});

describe("fuzzy ambiguity", () => {
  it("returns null when two officials tie at the same distance", () => {
    const index = new OfficialIndex([
      makeOfficial("Rue des Pins"),
      makeOfficial("Rue des Fins"),
    ]);
    // "Rue des Bins" is at distance 1 from both -> ambiguous
    expect(index.lookup("Rue des Bins")).toBeNull();
  });

  it("still matches when entries share the same name", () => {
    const index = new OfficialIndex([
      makeOfficial("Rue des Pins", { comName: "Lausanne" }),
      makeOfficial("Rue des Pins", { comName: "Pully", zipLabel: "1009 Pully" }),
    ]);
    const m = index.lookup("Rue des Pinss");
    expect(m?.level).toBe("near");
    expect(m?.candidates).toHaveLength(2);
  });
});

describe("way-type stem matching (WRONG_TYPE)", () => {
  it("matches a wrong way type when the stem is unique", () => {
    const local = new OfficialIndex([makeOfficial("Route de la Guérite")]);
    const m = local.lookup("Chemin de la Guérite");
    expect(m?.level).toBe("stem");
    expect(m?.entry.namePart).toBe("Route de la Guérite");
  });

  it("matches German glued suffixes", () => {
    const local = new OfficialIndex([makeOfficial("Bahnhofstrasse")]);
    const m = local.lookup("Bahnhofweg");
    expect(m?.level).toBe("stem");
    expect(m?.entry.namePart).toBe("Bahnhofstrasse");
  });

  it("stays unmatched when two officials share the stem", () => {
    const local = new OfficialIndex([
      makeOfficial("Route du Moulin"),
      makeOfficial("Rue du Moulin"),
    ]);
    expect(local.lookup("Chemin du Moulin")).toBeNull();
  });

  it("still groups multi-commune duplicates of the same name", () => {
    const local = new OfficialIndex([
      makeOfficial("Route de la Guérite", { zipLabel: "1580 Avenches" }),
      makeOfficial("Route de la Guérite", { zipLabel: "1595 Faoug" }),
    ]);
    const m = local.lookup("Chemin de la Guérite");
    expect(m?.level).toBe("stem");
    expect(m?.candidates).toHaveLength(2);
  });

  it("matches a bare name against an official name WITH a way type", () => {
    const local = new OfficialIndex([
      makeOfficial("Rue Vers-chez-Cherbuin", { zipLabel: "1562 Corcelles-près-Payerne" }),
    ]);
    const m = local.lookup("Vers-Chez-Cherbuin");
    expect(m?.level).toBe("stem");
    expect(m?.entry.namePart).toBe("Rue Vers-chez-Cherbuin");
  });

  it("matches a bare name against a multi-word way type official", () => {
    const local = new OfficialIndex([
      makeOfficial("Zone Industrielle La Palaz A", { zipLabel: "1530 Payerne" }),
      makeOfficial("Zone Industrielle La Palaz B", { zipLabel: "1530 Payerne" }),
    ]);
    const m = local.lookup("La Palaz A");
    expect(m?.level).toBe("stem");
    expect(m?.entry.namePart).toBe("Zone Industrielle La Palaz A");
  });

  it("matches a bare name with articles against the typed official name", () => {
    const local = new OfficialIndex([makeOfficial("Route de la Bricoleta")]);
    const m = local.lookup("La Bricoleta");
    expect(m?.level).toBe("stem");
    expect(m?.entry.namePart).toBe("Route de la Bricoleta");
  });

  it("keeps the ambiguity guard for bare names", () => {
    const local = new OfficialIndex([
      makeOfficial("Route du Moulin"),
      makeOfficial("Rue du Moulin"),
    ]);
    expect(local.lookup("Moulin")).toBeNull();
  });

  it("does not fire without a recognizable way type", () => {
    const local = new OfficialIndex([makeOfficial("Route de la Guérite")]);
    expect(local.lookup("La Bricoleta")).toBeNull();
  });
});

describe("bilingual slash labels", () => {
  const index = new OfficialIndex(BIEL_STREETS);

  it("accepts the full label", () => {
    expect(index.lookup("Bielstrasse/Rue de Bienne")?.level).toBe("exact");
  });

  it("accepts each side of the slash", () => {
    expect(index.lookup("Bielstrasse")?.level).toBe("exact");
    expect(index.lookup("Rue de Bienne")?.level).toBe("exact");
  });

  it("flags slash parts so the UI can show the full label", () => {
    const m = index.lookup("Bielstrasse");
    expect(m?.entry.isSlashPart).toBe(true);
    expect(m?.entry.street.label).toBe("Bielstrasse/Rue de Bienne");
  });
});

describe("suggestion ranking", () => {
  it("prefers official existing entries over planned/unofficial ones", () => {
    const index = new OfficialIndex([
      makeOfficial("Rue Neuve", { official: false, status: "geplant" }),
      makeOfficial("Rue Neuve", { official: true, status: "bestehend" }),
    ]);
    const m = index.lookup("rue neuve");
    expect(m?.entry.street.official).toBe(true);
  });

  it("prefers streets over named areas", () => {
    const index = new OfficialIndex([
      makeOfficial("Les Vergers", { type: "Benanntes Gebiet" }),
      makeOfficial("Les Vergers", { type: "Strasse" }),
    ]);
    expect(index.lookup("les vergers")?.entry.street.type).toBe("Strasse");
  });
});

describe("locality scoping", () => {
  const index = new OfficialIndex([
    makeOfficial("Rue de la Gare", { zipLabel: "1009 Pully", comName: "Pully" }),
  ]);

  it("reports inLocality=false when the name exists only elsewhere", () => {
    const m = index.lookup("Rue de la Gare", "lausanne");
    expect(m?.level).toBe("exact");
    expect(m?.inLocality).toBe(false);
  });

  it("reports inLocality=true for a same-locality match", () => {
    expect(index.lookup("Rue de la Gare", "pully")?.inLocality).toBe(true);
  });

  it("ignores locality when not provided", () => {
    expect(index.lookup("Rue de la Gare")?.inLocality).toBe(true);
  });
});

describe("otherLanguageLabels", () => {
  it("returns the other-language part of a bilingual label", () => {
    expect(otherLanguageLabels("Bielstrasse / Rue de Bienne", "Rue de Bienne")).toEqual([
      "Bielstrasse",
    ]);
    expect(otherLanguageLabels("Bielstrasse/Rue de Bienne", "Bielstrasse")).toEqual([
      "Rue de Bienne",
    ]);
  });

  it("excludes the primary case-insensitively", () => {
    expect(otherLanguageLabels("Spitalstrasse / Rue de l'Hôpital", "rue de l'hôpital")).toEqual([
      "Spitalstrasse",
    ]);
  });

  it("returns nothing for a monolingual label", () => {
    expect(otherLanguageLabels("Avenue de Florimont", "Avenue de Florimont")).toEqual([]);
  });
});
