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
  [WME Switzerland Helper installieren](https://raw.githubusercontent.com/73VW/WME-Switzerland-Helper/releases/releases/main.user.js)
- Ihr Browser wird eine Seite anzeigen, auf der Sie gefragt werden, ob Sie das Skript installieren möchten. Klicken Sie auf die Schaltfläche <kbd>Installieren</kbd>.

3. \*_Start Editing!_

- Öffnen Sie den [Waze Map Editor](https://www.waze.com/editor?tab=userscript_tab).
- Auf der Registerkarte "Skripte" sehen Sie neue Optionen und eine kurze Erklärung.

\*Das war's! Das Skript wird automatisch ausgeführt, wenn Sie den Waze Map Editor verwenden

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

---

## 💡 Brauchen Sie Hilfe? Haben Sie Ideen?

Wenn Sie Fragen haben, einen Fehler finden oder eine neue Funktion vorschlagen möchten:

1. Gehen Sie zum [Issue Tracker des Projekts](https://github.com/73VW/WME-Switzerland-Helper/issues/new).
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
