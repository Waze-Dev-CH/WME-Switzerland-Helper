import { describe, expect, it } from "vitest";
import {
  buildMessage,
  describeLanguages,
  isOfficialMessage,
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

  it("speaks each of the four languages, in full", () => {
    expect(buildMessage("de")).toBe(
      "Danke für Ihre Meldung. Fest installierte Radare können in Waze in der Schweiz und in Liechtenstein nicht angezeigt werden. Um den lokalen Vorschriften zu entsprechen, hat Waze die Meldung von Polizeikontrollen für Nutzer deaktiviert, die in der Schweiz und in Liechtenstein navigieren. Alle anderen Navigationsfunktionen, einschliesslich Gefahrenmeldungen, Verkehrsinformationen und Strassensperrungen, bleiben weiterhin uneingeschränkt verfügbar.",
    );
    expect(buildMessage("it")).toBe(
      "Grazie per la segnalazione. Gli autovelox fissi non possono essere visualizzati in Waze in Svizzera e Liechtenstein. Per conformarsi alle normative locali, Waze ha disattivato la segnalazione della polizia per gli utenti che navigano in Svizzera e Liechtenstein. Tutte le altre funzioni di navigazione, comprese le segnalazioni di pericoli, le informazioni sul traffico e le chiusure stradali, rimangono pienamente operative.",
    );
    expect(buildMessage("en")).toBe(
      "Thank you for your report. Fixed speed cameras cannot be shown in Waze in Switzerland and Liechtenstein. To comply with local regulations, Waze has disabled police reporting for users navigating in Switzerland and Liechtenstein. All other navigation features, including hazard alerts, traffic information and road closures, remain fully functional.",
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
