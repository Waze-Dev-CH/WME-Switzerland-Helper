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
  [Installare WME Switzerland Helper](https://raw.githubusercontent.com/Waze-Dev-CH/WME-Switzerland-Helper/releases/releases/main.user.js)
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

- **Controllo dei nomi delle vie ufficiali**
  Confronta i nomi dei segmenti visibili con il registro ufficiale svizzero delle vie (swisstopo) ed evidenzia le differenze, con correzione in un clic. Una scheda dedicata **CH · Nomi delle vie** elenca le anomalie, raggruppate e distinte per colore, e il pannello di modifica del segmento mostra il verdetto per il segmento selezionato.

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

### Come funziona il controllo dei nomi delle vie

Il **controllo dei nomi delle vie** confronta il nome di ogni segmento con il registro ufficiale svizzero delle vie e mostra ciò che merita attenzione:

- **Stati distinti per colore**: ogni anomalia è evidenziata sulla mappa ed elencata con il proprio colore, dalle semplici differenze di tipografia e ortografia ai casi più seri, passando per le abbreviazioni e i probabili errori di battitura: un nome valido posto sulla **via sbagliata** (segnalato con ⚠️) o un nome **non trovato** nel registro. Ogni stato può essere attivato o disattivato.
- **Correzione in un clic**: quando il nome ufficiale è noto, un pulsante **Correggi** lo applica, per un singolo segmento o per un gruppo intero. **Nulla viene mai salvato automaticamente**: le vostre modifiche finiscono nella normale pila di modifiche di WME, che sta a voi rivedere e salvare.
- **Attento alla geometria**: gli assi ufficiali delle vie vengono associati ai segmenti, così un segmento senza nome riceve un suggerimento e un nome posto sulla via sbagliata viene rilevato.
- **Vie bilingui**: nei comuni bilingui il nome ufficiale porta entrambe le lingue (per esempio «Unterer Quai / Quai du Bas»); il controllo mantiene una lingua come nome principale e aggiunge l'altra come nome alternativo.
- **Ignorare i falsi positivi**: un pulsante **Ignora** nasconde un'anomalia che sapete non esserlo; resta nascosta (l'informazione è conservata localmente) e può essere reimpostata dalle impostazioni.
- **Collegamento al geoportale cantonale**: un pulsante apre il segmento sulla carta ufficiale del cantone interessato, quando disponibile.

---

## 💡 Avete bisogno di aiuto? Avete idee?

Se avete domande, trovate un bug o volete suggerire una nuova funzionalità:

1. Andate al [issue tracker del progetto](https://github.com/Waze-Dev-CH/WME-Switzerland-Helper/issues/new).
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

### [Non pubblicato]

#### Aggiunto

- **Le schede dello script dicono finalmente di appartenere allo stesso insieme.** La barra Script mescola le schede di tutti gli userscript installati, e nulla indicava che «Nomi delle vie» e «Numeri civici» venissero da questo. Entrambe si aprono ora con lo stesso breve contrassegno, **CH · Nomi delle vie** e **CH · Numeri civici**, accanto alla scheda principale **WME Svizzera Helper**, e le tre si affiancano nella barra quando l'editor lo consente. Se una futura versione di WME riorganizzasse quella barra, restano semplicemente dove capitano, sempre contrassegnate.
- **Importatore di numeri civici svizzeri.** Una nuova scheda 🏠 e un livello cartografico mostrano direttamente sulla mappa i punti indirizzo ufficiali del registro federale degli edifici e delle abitazioni (RegBL/GWR). Selezionate una via e compaiono tutti gli indirizzi noti al registro: in verde i numeri ancora mancanti, in verde chiaro quelli già mappati, in grigio quelli appartenenti a un'altra via. Cliccate su un punto verde e il numero civico viene creato alle coordinate stesse del registro, collegato al segmento che avete selezionato. Quando manca un'intera via, un pulsante li importa tutti insieme, dopo una conferma che elenca esattamente quali numeri saranno creati; fino a 50 per operazione, così una svista resta contenuta. Nulla viene salvato al posto vostro: ogni numero entra nelle vostre modifiche in corso e <kbd>Ctrl</kbd>+<kbd>Z</kbd> lo annulla. L'importatore conosce anche i numeri già presenti sui segmenti vicini della stessa via, quindi non propone di ricreare quello che WME tiene semplicemente sul tratto accanto; legge entrambi i nomi dei comuni bilingui, così un segmento Zentralstrasse corrisponde a un indirizzo in Rue Centrale; e tralascia gli indirizzi degli edifici solo progettati o ancora in costruzione. <kbd>Alt</kbd>+<kbd>H</kbd> avvia l'importazione in blocco senza lasciare la mappa (rimappabile nelle impostazioni della tastiera di WME).

  L'idea non è nostra: viene da [WME Quick HN Importer CH](https://greasyfork.org/en/scripts/551495-wme-quick-hn-importer-ch) di **Ari (Reloaded)** e **Gerhard**, a sua volta basato sul concetto originale di **Tom 'Glodenox' Puttemans** per il Belgio. Il merito di aver mostrato che i punti indirizzo del registro hanno il loro posto sulla mappa è loro. Questa è una nuova implementazione scritta sull'SDK di WME, non un port del loro codice.
- **Protezioni sulle correzioni in blocco.** «Correggi tutto» può rinominare fino a 50 segmenti con un clic ed è ora disponibile dal livello 3 dell'editor in su; sotto quel livello il pulsante non compare e i segmenti si correggono uno alla volta. L'anomalia **via sbagliata** riceve ovunque più attenzione: è l'unico controllo deciso puramente dalla geometria, per cui un errore sostituisce un nome del tutto corretto. Ora chiede conferma ogni volta, anche per un solo segmento, mostra quanto sia solida davvero la corrispondenza (quale porzione del segmento l'altra via copre e le distanze in gioco) e parte disattivata sotto il livello 3, dove può essere attivata dalle impostazioni come qualsiasi altra categoria. Le conferme dicono ora quali saranno i nomi, non solo quanti segmenti sono interessati.
- **Pannello staccabile** per il controllo dei nomi delle vie: WME passa la barra laterale al pannello di selezione appena cliccate un segmento, il che nascondeva l'elenco delle anomalie proprio mentre lo stavate esaminando. Il pannello può ora essere staccato in una finestra mobile che resta visibile e che potete spostare e ridimensionare. Posizione e dimensioni vengono ricordate tra una sessione e l'altra, e la finestra viene riportata sullo schermo se nel frattempo la finestra del browser si è rimpicciolita. Da staccata, la finestra porta la superficie di lavoro (barra degli strumenti, stato ed elenco delle anomalie) mentre la scheda conserva le opzioni, così le impostazioni restano dove ve le aspettate. Riagganciatela dal pulsante della finestra o dalla scheda, oppure commutate con <kbd>Alt</kbd>+<kbd>W</kbd> (rimappabile nelle impostazioni della tastiera di WME). La scheda resta l'impostazione predefinita: nulla cambia finché non lo chiedete.
- Pulsante **Analizza quest'area**: le viste troppo ampie per l'analisi automatica (oltre 6 km²) possono ora essere analizzate su richiesta, fino a 50 km². La scansione recupera il registro ufficiale a lotti, riversa i risultati parziali nell'elenco man mano, mostra l'avanzamento per tasselli nel banner di stato e può essere interrotta in qualsiasi momento (i risultati parziali vengono conservati). Spostare la mappa non interrompe una scansione in corso.
- Avvisi sulla qualità dei dati sotto il banner di stato: le aree dense troncate dall'API del registro (possibile causa di falsi «non trovato»), le aree che non hanno potuto essere caricate e un budget di ricerca nazionale esaurito vengono ora segnalati invece di essere registrati in silenzio.

#### Corretto

- Una singola richiesta al registro fallita non interrompe più l'intera analisi: l'area interessata viene saltata (i suoi segmenti restano non controllati anziché segnalati a torto) e ritentata alla scansione successiva.
- `npm run makemessages` non riversa più chiavi vuote, provenienti dallo spazio dei nomi del controllo, in ogni catalogo di traduzione.

#### Modificato

- Accessibilità da tastiera e con screen reader: le intestazioni di gruppo e le righe delle anomalie sono veri pulsanti (Invio e Spazio funzionano), i comandi con la sola icona hanno un'etichetta, i filtri espongono il proprio stato premuto e ogni comando mostra un contorno di focus visibile.
- I distintivi di gruppo mostrano ora il codice di stato accanto al punto colorato: uno stato non è più trasmesso dal solo colore.
- Aree di clic più ampie sulle icone di riga; i due collegamenti a visualizzatori esterni (map.geo.admin.ch e carta cantonale) sono raggruppati in un unico riquadro.
- Espandere un gruppo non sposta più la mappa; un pulsante ⌖ dedicato nell'intestazione del gruppo inquadra tutti i suoi segmenti.
- L'opzione «Mostra solo i segmenti visibili sulla mappa» è ora disponibile anche accanto agli interruttori principali (resta comunque nelle impostazioni).
- L'elenco delle anomalie adatta la propria altezza alla finestra invece di un limite fisso del 48 %, mantenendo legenda e impostazioni a portata.
- I colori di avviso, correzione e ignora seguono ora il tema scuro dell'editor, e un cambio di aspetto di WME viene recepito durante l'uso senza ricaricare.

### [1.4.0] - 2026-06-16

#### Aggiunto

- 🛣️ Controllo dei nomi delle vie ufficiali: confronta i nomi dei segmenti Waze con il registro svizzero delle vie (swisstopo / `api3.geo.admin.ch`), con una scheda dedicata **CH · Nomi delle vie** e un riquadro di verdetto nel pannello di modifica. Comprende stati distinti per colore (tipografia, abbreviazione o variante, probabile errore di battitura, via sbagliata ⚠️, località sbagliata, non trovato, senza nome, bilingue, controlli delle regole svizzere e dei blocchi), corrispondenza geometrica, correzione in un clic (mai salvata automaticamente), gestione dei nomi alternativi bilingui, un'azione Ignora per i falsi positivi e un collegamento al geoportale cantonale. Integrato dallo userscript autonomo `WME-CH-Street-Name-Checker`: la sua storia dettagliata dalla 1.0 alla 1.18 è conservata in [`docs/street-name-checker-changelog.md`](./docs/street-name-checker-changelog.md).
- Pulsante **Ignora tutto** per gruppo, per scartare in una volta un intero gruppo di falsi positivi (con una conferma per i gruppi numerosi)
- Controllo del blocco delle rotatorie: le rotatorie sono ora attese bloccate almeno a **L3**

#### Corretto

- Impostare la lingua del controllo non cambia più la lingua del resto dello script (per esempio le finestre di dialogo dei trasporti pubblici)
- Meno false segnalazioni **via sbagliata**: un nome che corrisponde a una voce del registro priva di asse mappato (per esempio una località denominata) non viene più segnalato, e un nome che è solo una parte della dicitura ufficiale (per esempio «Bach» dentro «Bachweg») è ora trattato correttamente
- I nomi frequenti («Route de Berne») non segnalano più erroneamente **non trovato** quando l'asse corrispondente appartiene a un comune vicino: la ricerca nel registro scorre ora tutte le pagine dei risultati
- Le continuazioni non restano più bloccate come falso **non trovato** dopo aver messo in pausa l'analisi e poi modificato
- I falsi positivi scartati (Ignora) vengono conservati attraverso i cambiamenti di formato delle impostazioni invece di essere reimpostati in silenzio
- Per un segmento senza geometria non viene più mostrato alcun collegamento alla carta cantonale (in precedenza puntava fuori dalla Svizzera)

#### Modificato

- Ricontrollo più rapido durante la modifica: le ricerche dei nomi e gli indirizzi vengono memorizzati, solo le evidenziazioni cambiate vengono ridisegnate e lo spostamento della mappa è temporizzato
- Stile dei pulsanti: i pulsanti Correggi sono verdi e quelli Ignora di un grigio neutro, per evitare clic sbagliati; i nomi lunghi nelle intestazioni di gruppo vanno a capo invece di essere spezzati carattere per carattere
- Il collegamento alla carta cantonale vodese apre ora il nuovo visualizzatore `geoportail.vd.ch` con lo sfondo ibrido e il tema mobilità (circondari, gerarchia della rete stradale cantonale, linee ferroviarie, attraversamenti di località); i collegamenti cantonali si aprono ora a uno zoom più ravvicinato di 1:2000

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
