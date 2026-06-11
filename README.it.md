# Aiuto WME Svizzera

Benvenuti! Questo strumento è stato progettato per rendere la modifica dell'editor di mappe Waze (WME) più semplice ed efficace per tutti coloro che lavorano sulle mappe in Svizzera - non è richiesto alcun background tecnico.

---

## 📚 Documentazione nella vostra lingua

Scegliere la lingua preferita:

- 🇬🇧 [Inglese](./README.md)
- 🇫🇷 [Francese](./README.fr.md)
- 🇮🇹 [Italiano](./README.it.md)
- 🇩🇪 [Tedesco](./README.de.md)

---

## 🚀 Cos'è questo script?

**WME Switzerland Helper** è un componente aggiuntivo gratuito per Waze Map Editor. Aggiunge nuove funzionalità e dati ufficiali sulle mappe svizzere, rendendo più facile modificare e migliorare le mappe della Svizzera.

Non è necessario essere programmatori o avere particolari competenze tecniche per utilizzarlo!

---

## 🛠️ Come installare e utilizzare

1. **Installare Tampermonkey**
   Tampermonkey è un'estensione gratuita del browser che consente di aggiungere script utili ai siti web.

- [Ottenere Tampermonkey per Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Per altri browser, cercate "Tampermonkey" nel negozio di estensioni/add-on del vostro browser.

2. **Aggiungi il WME Switzerland Helper Script**

- Dopo aver installato Tampermonkey, fare clic su questo link:  
  [Installare WME Switzerland Helper](https://raw.githubusercontent.com/73VW/WME-Switzerland-Helper/releases/releases/main.user.js)
- Il browser mostrerà una pagina che chiede se si desidera installare lo script. Fare clic sul pulsante <kbd>Installa</kbd>.

3. \*\*Iniziare a modificare!

- Aprite il [Waze Map Editor](https://www.waze.com/editor?tab=userscript_tab).
- Vedrete nuove opzioni e una breve spiegazione nella scheda `Scripts`.

_Ecco fatto! Lo script viene eseguito automaticamente quando si utilizza l'Editor mappe di Waze._

---

## 🌟 Caratteristiche

Con questo script, otterrete:

- **Livelli di mappa ufficiali della Svizzera**
  Aggiunta e visualizzazione di livelli cartografici aggiuntivi direttamente in WME, tra cui:
  - Confini comunali svizzeri (da swisstopo)
  - Confini cantonali svizzeri (da swisstopo)
  - Nomi geografici (swissNAMES3D)
  - Carte nazionali svizzere a colori
  - Immagini aeree svizzere ad alta risoluzione
  - Fermate del trasporto pubblico

- **Controlli facili per i livelli**
  Attivate o disattivate ogni livello con semplici caselle di controllo nell'interfaccia di WME.

Tutti i dati cartografici provengono da fonti ufficiali svizzere (swisstopo), quindi potete fidarvi della loro accuratezza.

### Come funziona il livello delle fermate dei trasporti pubblici

Il livello **Fermate dei trasporti pubblici** mostra le fermate ufficiali del trasporto pubblico dal database delle Ferrovie federali svizzere (SBB). Ecco cosa dovete sapere:

- **Indicatori visivi**: le fermate da gestire appaiono come **icone di autobus arancioni**; le location WME la cui fermata non esiste più (rimossa o scaduta nei dati FFS) appaiono in **rosso** e possono essere eliminate
- **Abbinamento intelligente**: le fermate già mappate da una location con lo stesso nome entro un raggio di **75 metri** vengono nascoste; vengono mostrate solo quelle che richiedono un intervento
- **Raggruppamento**: a basso zoom (12–14) le fermate vicine sono raggruppate in **cluster**; cliccate su un cluster per zoomare sulla sua area
- **Pulsante di ricarica**: un pulsante con icona di autobus nella barra overlay ricarica il livello senza spostare la mappa, e gira durante il caricamento
- **Cliccate per agire**:
  - Arancione → creare una nuova location, oppure unire con / aggiornare una vicina; la città della fermata viene impostata automaticamente dalla sua località
  - Rosso → eliminare la location obsoleta
- **Tipi supportati**: autobus, tram, treni, barche, cabinovie e funicolari in tutta la Svizzera

---

## 💡 Avete bisogno di aiuto? Avete idee?

Se avete domande, trovate un bug o volete suggerire una nuova funzionalità:

1. Andate al [issue tracker del progetto](https://github.com/73VW/WME-Switzerland-Helper/issues/new).
2. Cliccare su **"Nuovo problema "**.
3. Compilare il titolo e descrivere la domanda, il problema o l'idea.  
   (Non preoccupatevi se siete nuovi su GitHub: potrebbe essere necessario creare un account gratuito)
4. Invia il tuo problema. I manutentori vi risponderanno al più presto.

---

Grazie per aver contribuito a rendere Waze migliore per tutti in Svizzera!

---

## 📝 Changelog

Tutti i cambiamenti notevoli di questo progetto sono documentati qui.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
e questo progetto aderisce al [Versionamento Semantico](https://semver.org/spec/v2.0.0.html).

### [1.3.0] - 2026-06-11

#### Aggiunto

- 🔴 Rilevamento delle fermate obsolete: le location di trasporto WME che non corrispondono più a una fermata FFS attiva sono mostrate in rosso e possono essere eliminate
- 🟠 Raggruppamento agli zoom 12–14: le fermate vicine sono raggruppate in cluster cliccabili che zoomano sulla loro area
- 🔄 Pulsante di ricarica (icona di autobus) nella barra overlay, che ricarica il livello senza spostare la mappa e gira durante il caricamento
- 🏙️ Assegnazione automatica della città alla creazione/aggiornamento di una location, dedotta dalla località della fermata (con ripiego sul suffisso del cantone)
- ⚡ Rendering progressivo a tasselli con cache del viewport (riusa i dati allo zoom avanti / spostamento interno, ricarica altrimenti)
- ✅ Test unitari (Vitest) per la pulizia dei nomi, l'abbinamento delle città e la validità delle fermate

#### Modificato

- Le location vengono recuperate direttamente dall'API Waze Features (`venueLevel=4`) in parallelo ai dati FFS, correggendo le fermate di autobus/treno mancanti sotto lo zoom 17; le richieste sono suddivise per cella della griglia per aggirare il limite per richiesta dell'API
- Normalizzazione dei nomi delle fermate riscritta e testata: rimuove il prefisso della località (esatto/abbreviato/troncato), le parentesi di trasporto finali e i marchi ferroviari (CFF/SBB/FFS), espande le abbreviazioni comuni (Ptes→Petites, Rte→Route, Bif.→Bifurcation…) e mantiene un suffisso di cantone di 2 lettere
- Le fermate sono filtrate per validità: solo le fermate attive (`validto` ≥ oggi) sono proposte per l'aggiunta/aggiornamento
- L'unione mira a una sola location scelta; una location nello stesso punto (≤2,5 m) propone solo «unisci»; più corrispondenze aprono una selezione
- Zoom minimo abbassato a 12 e zoom di modifica della location a 16
- Le fermate CABLE_RAILWAY sono denominate «station de funiculaire»

#### Corretto

- Spostamento/zoom della mappa con debounce (700 ms) per evitare richieste ridondanti
- Una selezione di location fallita (es. un porto fuori schermo) non interrompe più il gestore del clic
- Cliccare su una fermata sotto lo zoom 16 non rompe più la casella di controllo del livello

### [1.2.4] - 2026-01-14

#### Modificato

- Barra laterale ristrutturata per utilizzare classi TypeScript per tutti i componenti UI (SidebarTab, SidebarSection, SidebarItem, Paragraph, TextContent)

### [1.2.3] - 2025-12-12

#### Modificato

- Refactoring dell'architettura: rimossa eredità tripla, `SBBDataLayer` è ora una classe utility (composizione su eredità)
- Ottimizzazione delle performance: approccio basato su delta (disegna solo nuove features, rimuove obsolete in batch)
- Efficienza filtro migliorata: location recuperate una volta per passaggio di rendering invece che per record SDK
- Utility `waitForMapIdle()` per attendere correttamente i dati della mappa dopo le operazioni di zoom
- Flusso zoom-a-17 corretto: attende ora la disponibilità delle location prima di ri-filtrare features

#### Risolto

- Le fermate di trasporto pubblico non mostrano più duplicati dopo lo zoom da < 17 a 17

### [1.2.2] - 2025-12-11

#### Risolto

- Risolto il caricamento di tutte le fermate di trasporto pubblico al ricaricamento dello script quando la casella era preselezionata. Lo stato del layer viene ora ripristinato dopo l'evento `wme-ready` per garantire che i dati delle location siano disponibili prima di filtrare le fermate duplicate.

### [1.2.1] - 2025-12-10

#### Modificato

- 💾 Stato delle caselle dei livelli conservato tra i reload
- ⚡ Rendering più veloce; si aggiornano solo elementi nuovi/rimossi

### [1.2.0]

#### Aggiunto

- 🚏 Layer Fermate trasporto pubblico con gestione del click

### [1.1.0]

#### Aggiunto

- 🗺️ Aggiunto overlay swissNAMES3D

### [1.0.0]

#### Aggiunto

- 🎉 Prima versione con confini comunali/cantonali e mappe nazionali

---

## Avviso di copyright

Questo progetto si basa sul fantastico lavoro di Francesco Bedini, che ha creato un modello per sviluppare gli userscript di WME in Typescript. Potete trovare il progetto originale [qui](https://github.com/bedo2991/wme-typescript).

Il suo codice è rilasciato sotto la Licenza MIT, disponibile [qui](./LICENSE.original) al momento della creazione di questo fork.

Tutto il codice relativo al devcontainer Docker, alle impostazioni di VS Code, all'uso dei locales e al raggruppamento dei pacchetti ("Tools") è anch'esso rilasciato sotto licenza MIT.

Tutto il codice in `/src/` (e qualsiasi file con una menzione di copyright a Maël Pedretti) è concesso in licenza secondo la [GNU Affero General Public License v3.0 o successiva (AGPL)](./LICENSE).

**Riepilogo:**

- L'uso del codice originale rimane sotto la Licenza MIT.
- L'uso del codice aggiunto è limitato sotto AGPL come descritto in `LICENSE`.

Questo progetto ha quindi una **doppia licenza**: porzioni sotto MIT (originale e strumenti), porzioni sotto AGPL (tutto il codice `/src/` e il nuovo lavoro di Maël Pedretti).
