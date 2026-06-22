import { describe, expect, it } from "vitest";
import { foldAccents, isRouteDesignation, k0, k1, k2, stemKey } from "../matching/normalize";

describe("k0", () => {
  it("trims and NFC-normalizes", () => {
    expect(k0("  Rue du Grand-Pont ")).toBe("Rue du Grand-Pont");
    // combining circumflex (e + U+0302) -> precomposed e-circumflex
    expect(k0("Fore\u{0302}t")).toBe("For\u{00EA}t");
  });
});

describe("k1 (cosmetic)", () => {
  it("normalizes typographic apostrophes", () => {
    expect(k1("Ch. de l’Eglise")).toBe(k1("Ch. de l'Eglise"));
  });

  it("normalizes long dashes", () => {
    expect(k1("Petit–Chêne")).toBe(k1("Petit-Chêne"));
    expect(k1("Petit—Chêne")).toBe(k1("Petit-Chêne"));
  });

  it("collapses whitespace", () => {
    expect(k1("Rue  de   la Gare")).toBe(k1("Rue de la Gare"));
  });

  it("removes spaces around hyphens", () => {
    expect(k1("Petit - Chêne")).toBe(k1("Petit-Chêne"));
  });

  it("is case-insensitive", () => {
    expect(k1("rue de la gare")).toBe(k1("Rue de la Gare"));
  });

  it("maps ß to ss (Swiss orthography)", () => {
    expect(k1("Straße")).toBe(k1("Strasse"));
  });

  it("KEEPS accents: a missing accent is a real error", () => {
    expect(k1("Foret")).not.toBe(k1("Forêt"));
  });

  it("is idempotent", () => {
    const samples = ["Ch. de l’Eglise", "Petit – Chêne", "STRASSE  ß"];
    for (const s of samples) expect(k1(k1(s))).toBe(k1(s));
  });
});

describe("foldAccents", () => {
  it("strips diacritics", () => {
    expect(foldAccents("forêt-éàüöç")).toBe("foret-eauoc");
  });
});



describe("stemKey", () => {
  it("strips the way type and articles", () => {
    expect(stemKey("chemin de la guerite")).toBe("guerite");
    expect(stemKey("route de la guerite")).toBe("guerite");
    expect(stemKey("avenue du general guisan")).toBe("general guisan");
  });

  it("strips multi-word way types", () => {
    expect(stemKey("zone industrielle la palaz a")).toBe("palaz a");
    expect(stemKey("zone artisanale du vivier")).toBe("vivier");
  });

  it("strips German glued suffixes", () => {
    expect(stemKey("bahnhofstrasse")).toBe("bahnhof");
    expect(stemKey("bahnhofweg")).toBe("bahnhof");
  });

  it("returns null without a recognizable way type", () => {
    expect(stemKey("la bricoleta")).toBeNull();
    expect(stemKey("weg")).toBeNull();
  });
});

describe("article-insensitive K2 variants", () => {
  const intersects = (a: string, b: string): boolean =>
    k2(a).some((key) => k2(b).includes(key));

  it("matches names differing by a French article", () => {
    expect(intersects("Chemin de Montaz", "Chemin de la Montaz")).toBe(true);
    expect(intersects("Route des Essertines", "Route Essertines")).toBe(true);
  });

  it("strips elided articles", () => {
    expect(intersects("Chemin de l'Eglise", "Chemin Eglise")).toBe(true);
  });

  it("keeps strict variants first so exact K2 wins in the cascade", () => {
    expect(k2("Chemin de la Montaz")[0]).toBe("chemin de la montaz");
  });

  it("does not strip German articles", () => {
    expect(intersects("Im Grund", "Grund")).toBe(false);
  });

  it("never strips down to a single token", () => {
    expect(k2("La Place")).toEqual(["la place"]);
  });
});

describe("k2 (expanded)", () => {
  const intersects = (a: string, b: string): boolean =>
    k2(a).some((key) => k2(b).includes(key));

  it("folds accents", () => {
    expect(intersects("Foret", "Forêt")).toBe(true);
  });

  it("treats hyphen and space as equivalent", () => {
    expect(intersects("Saint-Roch", "Saint Roch")).toBe(true);
  });

  it("expands Av. as first token", () => {
    expect(intersects("Av. de la Gare", "Avenue de la Gare")).toBe(true);
  });

  it("expands Ch. only as first token", () => {
    expect(intersects("Ch. de l'Eglise", "Chemin de l'Église")).toBe(true);
    expect(intersects("Route du Ch", "Route du Chemin")).toBe(false);
  });

  it("expands Rte, Bd, Pl, Fbg", () => {
    expect(intersects("Rte de Berne", "Route de Berne")).toBe(true);
    expect(intersects("Bd de Grancy", "Boulevard de Grancy")).toBe(true);
    expect(intersects("Pl. du Marché", "Place du Marché")).toBe(true);
    expect(intersects("Fbg de l'Hôpital", "Faubourg de l'Hôpital")).toBe(true);
  });

  it("expands Pl. to Platz too (multi-language)", () => {
    expect(intersects("Pl. Centrale", "Platz Centrale")).toBe(true);
  });

  it("expands St- to Saint and Sankt", () => {
    expect(intersects("St-Roch", "Saint-Roch")).toBe(true);
    expect(intersects("Place St-François", "Place Saint-François")).toBe(true);
    expect(intersects("St. Gallerstrasse", "Sankt Gallerstrasse")).toBe(true);
  });

  it("expands Swiss multi-word abbreviations (Z.I., ZA)", () => {
    expect(intersects("Z.I. Champ Cheval", "Zone industrielle Champ Cheval")).toBe(true);
    expect(intersects("Z. I. Champ Cheval", "Zone industrielle Champ Cheval")).toBe(true);
    expect(intersects("ZI Champ Cheval", "Zone industrielle Champ Cheval")).toBe(true);
    expect(intersects("ZA du Vivier", "Zone artisanale du Vivier")).toBe(true);
  });

  it("expands Romandie abbreviations (Gd, Gén., Dr, Pte)", () => {
    expect(intersects("Gd-Rue", "Grand-Rue")).toBe(true);
    expect(intersects("Av. du Gén. Guisan", "Avenue du Général Guisan")).toBe(true);
    expect(intersects("Rue du Dr Schwab", "Rue du Docteur Schwab")).toBe(true);
    expect(intersects("Pte Rue", "Petite Rue")).toBe(true);
  });

  it("expands glued German -str. suffix", () => {
    expect(intersects("Bahnhofstr.", "Bahnhofstrasse")).toBe(true);
    expect(intersects("Bahnhofstr", "Bahnhofstrasse")).toBe(true);
  });

  it("does not corrupt full -strasse names", () => {
    expect(k2("Bahnhofstrasse")).toEqual(["bahnhofstrasse"]);
  });

  it("does NOT expand bare r. (too ambiguous)", () => {
    expect(intersects("R. de Bourg", "Rue de Bourg")).toBe(false);
  });

  it("keeps Italian names intact", () => {
    expect(k2("Via San Gottardo")).toEqual(["via san gottardo"]);
  });
});

describe("isRouteDesignation", () => {
  it("accepts Swiss and European route numbers", () => {
    for (const name of ["A9", "A 1", "E62", "N5", "H18", "T10", "A9 - E62", "A1/E25", "A1 / E25"]) {
      expect(isRouteDesignation(name), name).toBe(true);
    }
  });

  it("rejects real street names and partial matches", () => {
    for (const name of ["Route de Berne", "A9 > Lausanne", "9", "Avenue A9", "Saint-Roch", ""]) {
      expect(isRouteDesignation(name), name).toBe(false);
    }
  });
});
