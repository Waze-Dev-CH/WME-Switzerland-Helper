import { describe, expect, it } from "vitest";
import { buildMessage, describeLanguages, messageLanguage } from "./message";

describe("messageLanguage", () => {
  it("reads the Waze app ids observed in WME", () => {
    expect(messageLanguage("francais")).toBe("fr");
    expect(messageLanguage("eng")).toBe("en");
    expect(messageLanguage("portuguese_pt")).toBe("en");
  });

  it("reads the likely German and Italian ids, whatever their case", () => {
    expect(messageLanguage("deutsch")).toBe("de");
    expect(messageLanguage("Italiano")).toBe("it");
    expect(messageLanguage("FRANCAIS")).toBe("fr");
  });

  it("falls back to English when the language is unknown or missing", () => {
    expect(messageLanguage("dansk")).toBe("en");
    expect(messageLanguage(null)).toBe("en");
    expect(messageLanguage(undefined)).toBe("en");
    expect(messageLanguage("")).toBe("en");
  });
});

describe("buildMessage", () => {
  it("puts the speed-camera sentence before the official text, in French", () => {
    expect(buildMessage("fr")).toBe(
      "Merci pour votre signalement. Les radars fixes ne peuvent pas être affichés dans Waze " +
        "en Suisse et au Liechtenstein. Afin de respecter la réglementation locale, Waze a " +
        "désactivé le signalement de la police pour les utilisateurs naviguant en Suisse et au " +
        "Liechtenstein. Toutes les autres fonctionnalités de navigation, notamment les alertes " +
        "de danger, les informations sur le trafic et les fermetures de routes, restent " +
        "pleinement fonctionnelles.",
    );
  });

  it("speaks each of the four languages", () => {
    expect(buildMessage("de")).toMatch(/^Danke für Ihre Meldung\./);
    expect(buildMessage("it")).toMatch(/^Grazie per la segnalazione\./);
    expect(buildMessage("en")).toMatch(/^Thank you for your report\./);
  });
});

describe("describeLanguages", () => {
  it("counts per language, most frequent first", () => {
    expect(describeLanguages(["de", "fr", "fr", "it", "fr", "de"])).toBe(
      "3 FR, 2 DE, 1 IT",
    );
  });

  it("keeps a fixed order on a tie and omits absent languages", () => {
    expect(describeLanguages(["en", "fr"])).toBe("1 FR, 1 EN");
  });
});
