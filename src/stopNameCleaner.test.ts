import { describe, it, expect } from "vitest";
import { cleanStopName } from "./stopNameCleaner";

describe("cleanStopName", () => {
  it("strips a truncated locality prefix and expands abbreviations", () => {
    expect(
      cleanStopName("La Chaux-de-F, Ptes Crosettes", "La Chaux-de-Fonds"),
    ).toBe("Petites Crosettes");
  });

  it("strips a locality prefix that carries a canton suffix", () => {
    expect(cleanStopName("Brügg BE, Chaletweg", "Brügg BE")).toBe("Chaletweg");
  });

  it("strips a locality prefix that differs from the municipality", () => {
    // localityname = Boveresse, municipalityname = Val-de-Travers
    expect(cleanStopName("Boveresse, Séchoir", "Boveresse")).toBe("Séchoir");
  });

  it("strips an exact locality prefix", () => {
    expect(cleanStopName("Prilly, Mont-Goulin", "Prilly")).toBe("Mont-Goulin");
  });

  it("removes a trailing parenthetical (télésiège)", () => {
    expect(cleanStopName("Buttes (télésiège)", "Buttes")).toBe("Buttes");
  });

  it("removes a trailing parenthetical (bateau)", () => {
    expect(cleanStopName("La Sauge (bateau)", "Cudrefin")).toBe("La Sauge");
  });

  it("expands Rte to Route", () => {
    expect(cleanStopName("Crissier, Rte de Cossonay", "Crissier")).toBe(
      "Route de Cossonay",
    );
  });

  it("expands a lowercase abbreviation (rte → Route) after a space-less comma", () => {
    expect(
      cleanStopName("Le Crêt-du-Locle,rte cantonale", "Le Crêt-du-Locle"),
    ).toBe("Route cantonale");
  });

  it("strips an exact locality prefix separated by a space (no comma)", () => {
    expect(
      cleanStopName("La Chaux-de-Fonds Les Forges", "La Chaux-de-Fonds"),
    ).toBe("Les Forges");
  });

  it("keeps the name when it equals the locality (would otherwise be empty)", () => {
    expect(cleanStopName("Boveresse", "Boveresse")).toBe("Boveresse");
  });

  it("expands Bif. to Bifurcation", () => {
    expect(cleanStopName("Travers, Bif.", "Travers")).toBe("Bifurcation");
  });

  it("keeps the locality when stripping would leave only a railway brand (CFF)", () => {
    expect(cleanStopName("St-Blaise CFF", "St-Blaise")).toBe("St-Blaise CFF");
  });

  it("keeps the name when the prefix is not the locality", () => {
    // localityname = Aeschau, prefix = Eggiwil → not the locality, keep as-is
    expect(cleanStopName("Eggiwil, Skilift", "Aeschau")).toBe(
      "Eggiwil, Skilift",
    );
  });
});
