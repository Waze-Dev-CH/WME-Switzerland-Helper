import { describe, expect, it } from "vitest";
import {
  buildMessage,
  isOfficialMessage,
  languageCounts,
  messageLanguage,
} from "./message";

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
  it("lays the French message out in short paragraphs", () => {
    expect(buildMessage("fr")).toBe(
      "Merci pour votre signalement.\n\n" +
        "Les radars fixes ne peuvent pas être affichés dans Waze en Suisse et au Liechtenstein.\n\n" +
        "Afin de respecter la réglementation locale, Waze a désactivé le signalement de la police " +
        "pour les utilisateurs naviguant en Suisse et au Liechtenstein.\n\n" +
        "Toutes les autres fonctionnalités de navigation, notamment les alertes de danger, les " +
        "informations sur le trafic et les fermetures de routes, restent pleinement fonctionnelles.",
    );
  });

  it("speaks each of the four languages, in full", () => {
    expect(buildMessage("de")).toBe(
      "Danke für Ihre Meldung.\n\n" +
        "Fest installierte Radare können in Waze in der Schweiz und in Liechtenstein nicht angezeigt werden.\n\n" +
        "Um den lokalen Vorschriften zu entsprechen, hat Waze die Meldung von Polizeikontrollen für Nutzer " +
        "deaktiviert, die in der Schweiz und in Liechtenstein navigieren.\n\n" +
        "Alle anderen Navigationsfunktionen, einschliesslich Gefahrenmeldungen, Verkehrsinformationen und " +
        "Strassensperrungen, bleiben weiterhin uneingeschränkt verfügbar.",
    );
    expect(buildMessage("it")).toBe(
      "Grazie per la segnalazione.\n\n" +
        "Gli autovelox fissi non possono essere visualizzati in Waze in Svizzera e Liechtenstein.\n\n" +
        "Per conformarsi alle normative locali, Waze ha disattivato la segnalazione della polizia per " +
        "gli utenti che navigano in Svizzera e Liechtenstein.\n\n" +
        "Tutte le altre funzioni di navigazione, comprese le segnalazioni di pericoli, le informazioni " +
        "sul traffico e le chiusure stradali, rimangono pienamente operative.",
    );
    expect(buildMessage("en")).toBe(
      "Thank you for your report.\n\n" +
        "Fixed speed cameras cannot be shown in Waze in Switzerland and Liechtenstein.\n\n" +
        "To comply with local regulations, Waze has disabled police reporting for users navigating " +
        "in Switzerland and Liechtenstein.\n\n" +
        "All other navigation features, including hazard alerts, traffic information and road " +
        "closures, remain fully functional.",
    );
  });
});

describe("isOfficialMessage", () => {
  it("recognises the full message in each language", () => {
    for (const lang of ["fr", "de", "it", "en"] as const)
      expect(isOfficialMessage(buildMessage(lang))).toBe(true);
  });

  it("rejects any other comment", () => {
    expect(isOfficialMessage("still there")).toBe(false);
    expect(isOfficialMessage("")).toBe(false);
  });

  it("recognises the body embedded in a longer text", () => {
    expect(isOfficialMessage(`Hello. ${buildMessage("de")} Bye.`)).toBe(true);
  });

  it("ignores how the line breaks came back from the server", () => {
    const flattened = buildMessage("fr").replace(/\s+/g, " ");
    const crlf = buildMessage("it").replace(/\n/g, "\r\n");
    expect(isOfficialMessage(flattened)).toBe(true);
    expect(isOfficialMessage(crlf)).toBe(true);
  });

  it("still recognises the single-block layout sent by earlier test builds", () => {
    const oldLayout =
      "Merci pour votre signalement. Les radars fixes ne peuvent pas être affichés dans Waze en " +
      "Suisse et au Liechtenstein. Afin de respecter la réglementation locale, Waze a désactivé le " +
      "signalement de la police pour les utilisateurs naviguant en Suisse et au Liechtenstein. " +
      "Toutes les autres fonctionnalités de navigation, notamment les alertes de danger, les " +
      "informations sur le trafic et les fermetures de routes, restent pleinement fonctionnelles.";
    expect(isOfficialMessage(oldLayout)).toBe(true);
  });
});

describe("languageCounts", () => {
  it("counts per language, most frequent first", () => {
    expect(languageCounts(["de", "fr", "fr", "it", "fr", "de"])).toEqual([
      { lang: "fr", count: 3 },
      { lang: "de", count: 2 },
      { lang: "it", count: 1 },
    ]);
  });

  it("keeps a fixed order on a tie and omits absent languages", () => {
    expect(languageCounts(["en", "fr"])).toEqual([
      { lang: "fr", count: 1 },
      { lang: "en", count: 1 },
    ]);
  });
});
