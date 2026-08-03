# WME Switzerland Helferin

Willkommen! Dieses Tool wurde entwickelt, um die Bearbeitung des Waze Map Editors (WME) einfacher und effektiver zu machen für alle, die an Karten in der Schweiz arbeiten - ohne technisches Hintergrundwissen.

---

## 📚 Dokumentation in Ihrer Sprache

Wählen Sie Ihre bevorzugte Sprache:

- 🇬🇧 [Englisch](./README.md)
- 🇫🇷 [Französisch](./README.fr.md)
- 🇮🇹 [Italienisch](./README.it.md)
- 🇩🇪 [Deutsch](./README.de.md)

---

## 🚀 Was ist dieses Skript?

**WME Switzerland Helper** ist ein kostenloses Add-on für den Waze Map Editor. Es fügt neue Funktionen und offizielle Schweizer Kartendaten hinzu, die es einfacher machen, Karten in der Schweiz zu bearbeiten und zu verbessern.

Sie müssen kein Programmierer sein oder besondere technische Fähigkeiten haben, um es zu benutzen!

---

## 🛠️ Installation und Verwendung

1. **Tampermonkey installieren**
   Tampermonkey ist eine kostenlose Browsererweiterung, mit der Sie hilfreiche Skripte zu Websites hinzufügen können.

- [Tampermonkey für Chrome herunterladen](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Bei anderen Browsern suchen Sie im Erweiterungs-/Add-on-Store Ihres Browsers nach "Tampermonkey".

2. **Hinzufügen des WME Switzerland Helper Script**

- Nachdem Sie Tampermonkey installiert haben, klicken Sie auf diesen Link:  
  [WME Switzerland Helper installieren](https://raw.githubusercontent.com/Waze-Dev-CH/WME-Switzerland-Helper/releases/releases/main.user.js)
- Ihr Browser wird eine Seite anzeigen, auf der Sie gefragt werden, ob Sie das Skript installieren möchten. Klicken Sie auf die Schaltfläche <kbd>Installieren</kbd>.

3. \*_Start Editing!_

- Öffnen Sie den [Waze Map Editor](https://www.waze.com/editor?tab=userscript_tab).
- Auf der Registerkarte "Skripte" sehen Sie neue Optionen und eine kurze Erklärung.

\*Das war's! Das Skript wird automatisch ausgeführt, wenn Sie den Waze Map Editor verwenden

### Die Beta-Version testen

Möchten Sie ausprobieren, was als Nächstes kommt, und Probleme melden, bevor alle es bekommen?

- Installieren Sie stattdessen über diesen Link:  
  [Beta-Version installieren](https://raw.githubusercontent.com/Waze-Dev-CH/WME-Switzerland-Helper/beta-releases/releases/main.user.js)
- Die Beta wird unter ihrem eigenen Namen installiert, **WME Switzerland Helper (Beta)**, neben dem stabilen Skript. Deaktivieren Sie die stabile Version in Tampermonkey, bevor Sie sie verwenden: Zwei gleichzeitig laufende Kopien stören einander.
- Auch die Versionsnummer unterscheidet sie: Eine Beta hat vier Teile, `1.4.1.57`, die stabile Version drei, `1.4.1`.
- Um zurückzukehren, klicken Sie einfach erneut auf den normalen Installationslink oben.

---

## 🌟 Merkmale

Mit diesem Skript erhalten Sie:

- **Offizielle Schweizer Kartenebenen**
  Fügen Sie zusätzliche Kartenebenen direkt in WME hinzu und zeigen Sie sie an, darunter:
  - Schweizer Gemeindegrenzen (von swisstopo)
  - Schweizer Kantonsgrenzen (von swisstopo)
  - Geografische Namen (swissNAMES3D)
  - Farbige Landeskarten der Schweiz
  - Hochauflösendes Schweizer Luftbildmaterial
  - Haltestellen des öffentlichen Nahverkehrs

- **Einfache Layer-Steuerung**
  Schalten Sie jede Ebene mit einfachen Kontrollkästchen in der WME-Oberfläche ein oder aus.

- **Prüfung der offiziellen Strassennamen**
  Vergleicht die Namen der sichtbaren Segmente mit dem offiziellen Schweizer Strassenverzeichnis (swisstopo) und hebt Abweichungen hervor, mit Korrektur per Klick. Ein eigener Reiter **CH · Strassennamen** listet die Befunde auf, gruppiert und farblich unterschieden, und das Segment-Bearbeitungsfenster zeigt das Urteil zum ausgewählten Segment.

Alle Kartendaten stammen aus offiziellen Schweizer Quellen (swisstopo), so dass Sie auf ihre Genauigkeit vertrauen können.

### Funktionsweise der Haltestellen-Ebene des öffentlichen Nahverkehrs

Die Ebene **Haltestellen des öffentlichen Nahverkehrs** zeigt offizielle Haltestellen des öffentlichen Verkehrs aus der Datenbank der Schweizer Bundesbahnen (SBB) an. Das sollten Sie wissen:

- **Visuelle Indikatoren**: zu bearbeitende Haltestellen erscheinen als **orangefarbene Bus-Symbole**; WME-Orte, deren Haltestelle nicht mehr existiert (aus den SBB-Daten entfernt oder abgelaufen), erscheinen **rot** und können gelöscht werden
- **Intelligente Zuordnung**: Haltestellen, die bereits durch einen Ort mit demselben Namen im Umkreis von **75 Metern** erfasst sind, werden ausgeblendet; angezeigt werden nur die, die noch Arbeit erfordern
- **Gruppierung**: bei niedrigem Zoom (12–14) werden nahe Haltestellen zu **Clustern** gruppiert; klicken Sie auf ein Cluster, um auf dessen Bereich zu zoomen
- **Neu-laden-Schaltfläche**: eine Schaltfläche mit Bus-Symbol in der Overlay-Leiste lädt die Ebene neu, ohne die Karte zu bewegen, und dreht sich während des Ladens
- **Klicken zum Handeln**:
  - Orange → ein neues Venue erstellen oder mit einem nahen zusammenführen/aktualisieren; die Stadt der Haltestelle wird automatisch aus ihrer Ortschaft gesetzt
  - Rot → das veraltete Venue löschen
- **Unterstützte Typen**: Busse, Straßenbahnen, Züge, Boote, Seilbahnen und Standseilbahnen in der ganzen Schweiz

### So funktioniert die Strassennamen-Prüfung

Die **Strassennamen-Prüfung** vergleicht den Namen jedes Segments mit dem offiziellen Schweizer Strassenverzeichnis und zeigt, was Ihre Aufmerksamkeit verdient:

- **Farblich unterschiedene Status**: Jeder Befund wird auf der Karte hervorgehoben und mit seiner Farbe aufgelistet, von kleinen Unterschieden in Typografie und Schreibweise über Abkürzungen und wahrscheinliche Tippfehler bis zu ernsteren Fällen: ein gültiger Name auf der **falschen Strasse** (mit ⚠️ gekennzeichnet) oder ein Name, der im Verzeichnis **nicht gefunden** wird. Jeder Status lässt sich ein- und ausschalten.
- **Korrektur per Klick**: Ist der offizielle Name bekannt, übernimmt ihn eine Schaltfläche **Korrigieren**, für ein einzelnes Segment oder eine ganze Gruppe. **Nichts wird jemals automatisch gespeichert**: Ihre Änderungen landen im gewohnten WME-Änderungsstapel, zum Prüfen und Speichern durch Sie.
- **Geometrie wird berücksichtigt**: Die offiziellen Strassenachsen werden den Segmenten zugeordnet, so erhält ein Segment ohne Namen einen Vorschlag und ein auf der falschen Strasse platzierter Name wird erkannt.
- **Zweisprachige Strassen**: In zweisprachigen Gemeinden trägt der offizielle Name beide Sprachen (etwa «Unterer Quai / Quai du Bas»); die Prüfung behält eine Sprache als Hauptnamen und ergänzt die andere als Alternativnamen.
- **Fehlalarme ausblenden**: Eine Schaltfläche **Ignorieren** blendet einen Befund aus, von dem Sie wissen, dass er keiner ist; er bleibt ausgeblendet (lokal gespeichert) und kann in den Einstellungen zurückgesetzt werden.
- **Link zum kantonalen Geoportal**: Eine Schaltfläche öffnet das Segment auf der offiziellen Karte des betreffenden Kantons, sofern verfügbar.

---

## 💡 Brauchen Sie Hilfe? Haben Sie Ideen?

Wenn Sie Fragen haben, einen Fehler finden oder eine neue Funktion vorschlagen möchten:

1. Gehen Sie zum [Issue Tracker des Projekts](https://github.com/Waze-Dev-CH/WME-Switzerland-Helper/issues/new).
2. Klicken Sie auf **"Neues Problem "**.
3. Füllen Sie den Titel aus und beschreiben Sie Ihre Frage, Ihr Problem oder Ihre Idee.  
   (Keine Sorge, wenn Sie neu auf GitHub sind - Sie müssen möglicherweise ein kostenloses Konto erstellen)
4. Reichen Sie Ihr Problem ein. Die Betreuer werden sich so schnell wie möglich bei Ihnen melden.

---

Vielen Dank, dass Sie helfen, Waze für alle in der Schweiz besser zu machen!

---

## 📝 Changelog

Alle bemerkenswerten Änderungen an diesem Projekt sind hier dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### [Unveröffentlicht]

### [1.5.1] - 2026-08-03

#### Geändert

- **Hausnummernpunkte lassen sich jetzt auf einen Blick lesen.** Fehlende und bereits erfasste Nummern teilten sich dasselbe Grün und unterschieden sich allein durch ihre Blässe. Eine fehlende Nummer ist nun eine leuchtend grüne Scheibe mit einem **+**, eine bereits erfasste eine schiefergraue Scheibe mit einem **Haken**, und die beiden Fälle, bei denen Sie nichts tun können, bleiben klein und grau. Da jede ein Piktogramm trägt, beruht die Unterscheidung nicht mehr allein auf der Farbe. Keine der vier Farben wird zudem sonst irgendwo auf der Karte verwendet: Ein Adresspunkt lässt sich damit nicht mehr mit einer Haltestelle des öffentlichen Verkehrs oder einem Strassennamen-Befund verwechseln.

### [1.5.0] - 2026-07-31

#### Hinzugefügt

- **Die Reiter des Skripts zeigen endlich, dass sie zusammengehören.** Die Skript-Leiste mischt die Reiter aller installierten Userscripts, und nichts wies darauf hin, dass «Strassennamen» und «Hausnummern» von diesem hier stammen. Beide beginnen nun mit demselben kurzen Kennzeichen, **CH · Strassennamen** und **CH · Hausnummern**, neben dem Hauptreiter **WME Schweiz Helfer**, und die drei rücken in der Leiste nebeneinander, sofern der Editor es zulässt. Ordnet eine künftige WME-Version diese Leiste um, bleiben sie einfach dort, wo sie landen, weiterhin gekennzeichnet.
- **Importeur für Schweizer Hausnummern.** Ein neuer Reiter 🏠 und eine Kartenebene zeigen die offiziellen Adresspunkte des eidgenössischen Gebäude- und Wohnungsregisters (GWR) direkt auf der Karte. Wählen Sie eine Strasse, und alle dem Register bekannten Adressen erscheinen: grün die noch fehlenden Nummern, blassgrün die bereits erfassten, grau jene, die zu einer anderen Strasse gehören. Klicken Sie auf einen grünen Punkt, und die Hausnummer wird an den Koordinaten des Registers erstellt, verknüpft mit dem von Ihnen gewählten Segment. Fehlt eine ganze Strasse, importiert eine Schaltfläche alle auf einmal, nach einer Bestätigung, die genau aufführt, welche Nummern entstehen; bis zu 50 pro Vorgang, damit ein Versehen klein bleibt. Nichts wird für Sie gespeichert: Jede Nummer geht in Ihre offenen Änderungen, und <kbd>Strg</kbd>+<kbd>Z</kbd> macht sie rückgängig. Der Importeur kennt auch die Nummern auf den Nachbarsegmenten derselben Strasse und schlägt deshalb keine vor, die WME schlicht auf dem Stück nebenan führt; er liest beide Namen zweisprachiger Gemeinden, so dass ein Zentralstrasse-Segment zu einer Adresse an der Rue Centrale passt; und er lässt Adressen von Gebäuden aus, die erst geplant oder noch im Bau sind. <kbd>Alt</kbd>+<kbd>H</kbd> startet den Massenimport, ohne die Karte zu verlassen (in den WME-Tastatureinstellungen neu belegbar).

  Die Idee stammt nicht von uns: Sie kommt von [WME Quick HN Importer CH](https://greasyfork.org/en/scripts/551495-wme-quick-hn-importer-ch) von **Ari (Reloaded)** und **Gerhard**, das seinerseits auf dem ursprünglichen Konzept von **Tom 'Glodenox' Puttemans** für Belgien beruht. Ihnen gebührt das Verdienst, gezeigt zu haben, dass die Adresspunkte des Registers auf die Karte gehören. Hier handelt es sich um eine neue Umsetzung auf dem WME-SDK und nicht um eine Portierung ihres Codes.
- **Schutzvorkehrungen bei Massenkorrekturen.** «Alle korrigieren» kann bis zu 50 Segmente mit einem Klick umbenennen und steht nun ab Editor-Stufe 3 zur Verfügung; darunter erscheint die Schaltfläche nicht, und Segmente werden einzeln korrigiert. Der Befund **falsche Strasse** wird überall sorgfältiger behandelt: Er ist die einzige Prüfung, die rein über die Geometrie entschieden wird, weshalb ein Irrtum einen einwandfreien Namen ersetzt. Sie verlangt jetzt jedes Mal eine Bestätigung, auch für ein einzelnes Segment, sie zeigt, wie belastbar die Zuordnung wirklich ist (welchen Anteil des Segments die andere Strasse abdeckt und um welche Abstände es geht), und sie startet unterhalb von Stufe 3 ausgeschaltet, wo sie sich wie jede andere Kategorie in den Einstellungen aktivieren lässt. Bestätigungen nennen nun die künftigen Namen und nicht bloss die Anzahl betroffener Segmente.
- **Abtrennbares Fenster** für die Strassennamen-Prüfung: WME wechselt die Seitenleiste zum Auswahlfenster, sobald Sie ein Segment anklicken, was die Befundliste genau dann verbarg, wenn Sie sie abarbeiteten. Das Fenster lässt sich nun in ein frei schwebendes Fenster lösen, das sichtbar bleibt und das Sie verschieben und in der Grösse ändern können. Position und Grösse werden über Sitzungen hinweg gemerkt, und das Fenster wird zurück auf den Bildschirm geholt, falls Ihr Browserfenster zwischenzeitlich kleiner wurde. Im gelösten Zustand trägt das Fenster die Arbeitsfläche (Werkzeugleiste, Status und Befundliste), während der Reiter die Optionen behält, so bleiben die Einstellungen dort, wo Sie sie erwarten. Docken Sie es über die Schaltfläche des Fensters oder über den Reiter wieder an, oder schalten Sie mit <kbd>Alt</kbd>+<kbd>W</kbd> um (in den WME-Tastatureinstellungen neu belegbar). Der Reiter bleibt die Voreinstellung: Es ändert sich nichts, bis Sie es verlangen.
- Schaltfläche **Diesen Bereich prüfen**: Ausschnitte, die für die automatische Prüfung zu gross sind (über 6 km²), lassen sich nun auf Wunsch prüfen, bis 50 km². Der Durchlauf holt das offizielle Verzeichnis stapelweise, gibt Teilergebnisse laufend in die Liste, zeigt den Kachelfortschritt im Statusbanner und kann jederzeit abgebrochen werden (Teilergebnisse bleiben erhalten). Das Verschieben der Karte unterbricht einen laufenden Durchlauf nicht.
- Hinweise zur Datenqualität unter dem Statusbanner: dichte Gebiete, die von der Register-API abgeschnitten wurden (mögliche Ursache für falsche «nicht gefunden»), Gebiete, die nicht geladen werden konnten, und ein erschöpftes Budget für die landesweite Suche werden nun gemeldet statt still protokolliert.

#### Behoben

- Eine einzelne fehlgeschlagene Registerabfrage bricht nicht mehr die ganze Prüfung ab: Das betroffene Gebiet wird übersprungen (seine Segmente bleiben ungeprüft, statt falsch gemeldet zu werden) und bei der nächsten Prüfung erneut versucht.
- `npm run makemessages` schreibt keine leeren Schlüssel aus dem Namensraum der Prüfung mehr in jeden Sprachkatalog.

#### Geändert

- Bedienbarkeit per Tastatur und Screenreader: Gruppenköpfe und Befundzeilen sind echte Schaltflächen (Enter und Leertaste funktionieren), reine Symbolschaltflächen tragen eine Beschriftung, Filterchips zeigen ihren gedrückten Zustand, und jedes Bedienelement erhält einen sichtbaren Fokusrahmen.
- Gruppenabzeichen zeigen den Statuscode neben dem Farbpunkt: Ein Status wird nicht mehr allein über die Farbe vermittelt.
- Grössere Klickflächen bei den Zeilensymbolen; die beiden Links zu externen Betrachtern (map.geo.admin.ch und kantonale Karte) sind in einem Kasten zusammengefasst.
- Das Aufklappen einer Gruppe verschiebt die Karte nicht mehr; eine eigene Schaltfläche ⌖ im Gruppenkopf zoomt auf alle ihre Segmente.
- Die Option «Nur auf der Karte sichtbare Segmente anzeigen» steht nun auch neben den Hauptschaltern zur Verfügung (sie bleibt zusätzlich in den Einstellungen).
- Die Befundliste passt ihre Höhe an das Fenster an, statt bei festen 48 % zu deckeln, so bleiben Legende und Einstellungen in Reichweite.
- Die Farben für Warnung, Korrigieren und Ignorieren folgen nun dem dunklen Thema des Editors, und ein Wechsel des WME-Erscheinungsbilds wird zur Laufzeit übernommen, ohne neu zu laden.

### [1.4.0] - 2026-06-16

#### Hinzugefügt

- 🛣️ Prüfung der offiziellen Strassennamen: vergleicht die Namen der Waze-Segmente mit dem Schweizer Strassenverzeichnis (swisstopo / `api3.geo.admin.ch`), mit einem eigenen Reiter **CH · Strassennamen** und einem Urteilskasten im Bearbeitungsfenster. Enthält farblich unterschiedene Status (Typografie, Abkürzung oder Variante, wahrscheinlicher Tippfehler, falsche Strasse ⚠️, falscher Ort, nicht gefunden, ohne Namen, zweisprachig, Prüfungen der Schweizer Regeln und der Sperrstufen), geometrische Zuordnung, Korrektur per Klick (nie automatisch gespeichert), Umgang mit zweisprachigen Alternativnamen, eine Ignorieren-Aktion für Fehlalarme und einen Link zum kantonalen Geoportal. Übernommen aus dem eigenständigen Userscript `WME-CH-Street-Name-Checker`: dessen ausführliche Geschichte von 1.0 bis 1.18 bleibt in [`docs/street-name-checker-changelog.md`](./docs/street-name-checker-changelog.md) erhalten.
- Schaltfläche **Alle ignorieren** je Gruppe, um eine ganze Gruppe von Fehlalarmen auf einmal auszublenden (mit Bestätigung bei grossen Gruppen)
- Prüfung der Kreisel-Sperrstufe: Kreisel werden nun mindestens auf **L3** gesperrt erwartet

#### Behoben

- Das Einstellen der Sprache der Prüfung ändert nicht mehr die Sprache des übrigen Skripts (etwa der Dialoge zum öffentlichen Verkehr)
- Weniger falsche Meldungen **falsche Strasse**: Ein Name, der zu einem Registereintrag ohne erfasste Achse passt (etwa ein benanntes Gebiet), wird nicht mehr gemeldet, und ein Name, der nur ein Teil der offiziellen Bezeichnung ist (etwa «Bach» in «Bachweg»), wird nun richtig behandelt
- Häufige Namen («Route de Berne») melden nicht mehr fälschlich **nicht gefunden**, wenn die passende Achse zu einer Nachbargemeinde gehört: Die Registerabfrage blättert jetzt durch alle Ergebnisseiten
- Fortsetzungen bleiben nicht mehr als falsches **nicht gefunden** hängen, nachdem die Prüfung angehalten und danach bearbeitet wurde
- Ausgeblendete Fehlalarme (Ignorieren) bleiben über Änderungen am Einstellungsformat hinweg erhalten, statt still zurückgesetzt zu werden
- Für ein Segment ohne Geometrie wird kein Link zur kantonalen Karte mehr angezeigt (er zeigte zuvor ausserhalb der Schweiz)

#### Geändert

- Schnellere Neuprüfung während des Bearbeitens: Namensabfragen und Adressen werden zwischengespeichert, nur geänderte Hervorhebungen werden neu gezeichnet, und das Verschieben der Karte wird verzögert ausgewertet
- Gestaltung der Schaltflächen: Korrigieren-Schaltflächen sind grün, Ignorieren-Schaltflächen neutral grau, um Fehlklicks zu vermeiden; lange Namen in Gruppenköpfen brechen um, statt Zeichen für Zeichen getrennt zu werden
- Der Link zur kantonalen Karte der Waadt öffnet nun den neuen Betrachter `geoportail.vd.ch` mit dem Hybrid-Hintergrund und dem Mobilitätsthema (Kreise, kantonale Strassenhierarchie, Bahnlinien, Ortsdurchfahrten); kantonale Links öffnen jetzt mit einem näheren Zoom von 1:2000

### [1.3.0] - 2026-06-11

#### Hinzugefügt

- 🔴 Erkennung veralteter Haltestellen: WME-Verkehrsorte, die keiner aktiven SBB-Haltestelle mehr entsprechen, werden rot angezeigt und können gelöscht werden
- 🟠 Gruppierung bei Zoom 12–14: nahe Haltestellen werden zu anklickbaren Clustern zusammengefasst, die auf ihren Bereich zoomen
- 🔄 Neu-laden-Schaltfläche (Bus-Symbol) in der Overlay-Leiste, die die Ebene ohne Kartenbewegung neu lädt und sich während des Ladens dreht
- 🏙️ Automatische Stadtzuweisung beim Erstellen/Aktualisieren eines Venues, abgeleitet aus der Ortschaft der Haltestelle (mit Rückfall auf das Kantonskürzel)
- ⚡ Progressives kachelweises Rendern mit Viewport-Cache (Wiederverwendung der Daten beim Hineinzoomen / internen Verschieben, sonst Neuladen)
- ✅ Unit-Tests (Vitest) für Namensbereinigung, Stadtzuordnung und Haltestellengültigkeit

#### Geändert

- Venues werden direkt von der Waze Features API (`venueLevel=4`) parallel zu den SBB-Daten geladen, was fehlende Bus-/Bahnhöfe unter Zoom 17 behebt; Anfragen werden pro Rasterzelle aufgeteilt, um das Limit der API pro Anfrage zu umgehen
- Namensnormalisierung der Haltestellen neu geschrieben und getestet: entfernt das Ortschafts-Präfix (exakt/abgekürzt/abgeschnitten), abschließende Verkehrs-Klammern und Bahnmarken (CFF/SBB/FFS), expandiert gängige Abkürzungen (Ptes→Petites, Rte→Route, Bif.→Bifurcation…) und behält ein zweibuchstabiges Kantonskürzel
- Haltestellen werden nach Gültigkeit gefiltert: nur aktive Haltestellen (`validto` ≥ heute) werden zum Hinzufügen/Aktualisieren angeboten
- Das Zusammenführen zielt auf ein einziges gewähltes Venue; ein Venue am selben Punkt (≤2,5 m) bietet nur „zusammenführen“; mehrere Treffer öffnen eine Auswahl
- Mindest-Zoom auf 12 und Venue-Bearbeitungs-Zoom auf 16 gesenkt
- CABLE_RAILWAY-Haltestellen heißen „station de funiculaire“

#### Behoben

- Karten-Verschiebung/-Zoom entprellt (700 ms), um redundante Abfragen zu vermeiden
- Eine fehlgeschlagene Venue-Auswahl (z. B. ein Hafen außerhalb des Bildschirms) bricht den Klick-Handler nicht mehr ab
- Ein Klick auf eine Haltestelle unter Zoom 16 zerstört das Kontrollkästchen der Ebene nicht mehr

### [1.2.4] - 2026-01-14

#### Geändert

- Seitenleiste überarbeitet, um TypeScript-Klassen für alle UI-Komponenten zu verwenden (SidebarTab, SidebarSection, SidebarItem, Paragraph, TextContent)

### [1.2.3] - 2025-12-12

#### Geändert

- Architektur-Refactoring: Dreifache Vererbung entfernt, `SBBDataLayer` ist jetzt eine Utility-Klasse (Komposition statt Vererbung)
- Performance-Optimierung: Delta-basierter Ansatz (nur neue Features zeichnen, veraltete in Batch entfernen)
- Verbesserte Filter-Effizienz: Venues einmalig pro Rendu-Durchlauf statt pro SDK-Datensatz abrufen
- `waitForMapIdle()` Utility für korrektes Warten auf Kartendaten nach Zoom-Operationen
- Zoom-auf-17-Flow korrigiert: wartet jetzt auf Venues-Verfügbarkeit vor Re-Filter

#### Behoben

- ÖV-Haltestellen zeigen nach Zoom von < 17 zu 17 keine Duplikate mehr

### [1.2.2] - 2025-12-11

#### Behoben

- Fehler beim Laden aller Haltestellen beim Script-Neustart behoben, wenn die Checkbox vorher angehakt war. Der Layer-Status wird nun nach dem `wme-ready`-Event wiederhergestellt, um sicherzustellen, dass Venue-Daten verfügbar sind, bevor doppelte Haltestellen gefiltert werden.

### [1.2.1] - 2025-12-10

#### Geändert

- 💾 Layer-Kontrollkästchen bleiben über Reloads erhalten
- ⚡ Schnelleres Rendering; nur neue/entfernte Elemente werden aktualisiert

### [1.2.0]

#### Hinzugefügt

- 🚏 Layer für ÖV-Haltestellen mit Klick-Handling

### [1.1.0]

#### Hinzugefügt

- 🗺️ swissNAMES3D-Overlay hinzugefügt

### [1.0.0]

#### Hinzugefügt

- 🎉 Erste Version mit Gemeinde-/Kantonsgrenzen und nationalen Kartenkacheln

---

## Copyright-Hinweis

Dieses Projekt basiert auf der großartigen Arbeit von Francesco Bedini, der eine Vorlage zur Entwicklung von WME-Benutzerskripten in Typescript erstellt hat. Das Originalprojekt finden Sie [hier](https://github.com/bedo2991/wme-typescript).

Sein Code ist unter der MIT-Lizenz lizenziert, die zum Zeitpunkt der Erstellung dieses Forks [hier](./LICENSE.original) verfügbar war.

Der gesamte Code im Zusammenhang mit dem Docker Devcontainer, den VS-Code-Einstellungen, der Verwendung von Gebietsschemata und der Paketbündelung ("Tools") steht ebenfalls unter der MIT-Lizenz.

Der gesamte Code in `/src/` (und jede Datei mit einem Copyright-Vermerk auf Maël Pedretti) steht unter der [GNU Affero General Public License v3.0 oder später (AGPL)](./LICENSE).

**Zusammenfassung:**

- Die Verwendung des ursprünglichen Codes steht unter der MIT-Lizenz.
- Die Verwendung des von mir hinzugefügten Codes unterliegt den Einschränkungen der AGPL, wie in `LICENSE` beschrieben.

Dieses Projekt ist also **dual-licensed**: Teile unter MIT (Original und Werkzeuge), Teile unter AGPL (alle `/src/` Code und neue Arbeit von Maël Pedretti).
