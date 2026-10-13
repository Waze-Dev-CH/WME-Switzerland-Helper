# Map Mate : demander des précisions au rapporteur

Date : 2026-10-13
Branche : `feat/stale-urs` (suite directe des UR abandonnés)
Périmètre : `src/speed-camera-urs/` (dont le nom et le contenu de l'onglet), `locales/*/common.json`, les quatre README, `CLAUDE.md`

## 1. Pourquoi

Map Mate, le signalement vocal de Waze, crée des UR (source `REPORTING_AGENT`, type
`INCORRECT_GENERAL_ERROR`) dont la description commence par un code, par exemple
`MISSING_TRAFFIC_LIGHT: L'utilisateur a signalé un feu de circulation manquant sur la carte.`
(UR 27002003). La phrase générée ne dit presque rien : ni où exactement, ni ce que le
conducteur attendait. Sans réponse du rapporteur, l'éditeur ne peut rien corriger.

On envoie donc au rapporteur, dans sa langue, une question **adaptée au cas**, et l'UR reste
ouvert pour qu'il puisse répondre.

## 2. Ce qui est décidé

| Question | Décision |
| --- | --- |
| Famille | UR ouvert, éditable, `source === "REPORTING_AGENT"`, `updateRequestType === "INCORRECT_GENERAL_ERROR"`, et code de description connu (§2.1) |
| Code de description | Le texte **avant le premier `:`**, comparé à l'égalité stricte. `INCORRECT_TURN_X` n'est pas `INCORRECT_TURN` |
| Code inconnu | Aucune question. Mieux vaut rien qu'une question générique mal ciblée |
| Action | La question du cas part dans la langue du rapporteur. **L'UR reste ouvert.** Rien d'autre n'est écrit |
| Un par un | Bouton « Demander des précisions » sur chaque ligne, ouvert à tous les niveaux, avec confirmation qui cite le texte exact |
| Lot | Dans le bouton unique, au **niveau 3** (`BATCH_MIN_RANK`), comme les radars |
| Ordre dans le lot | Radars, puis questions Map Mate, puis abandonnés. `BATCH_CAP` (50) reste partagé |
| Commentaire existant | **Aucune question dès qu'il y a eu un commentaire**, ni en lot ni un par un. Seuls les commentaires automatiques de `Map_Team` ne comptent pas (`hasDiscussion`, même règle que les abandonnés). Un tel UR n'est pas listé |
| Déjà questionné | Jamais deux fois. Notre question est elle-même un commentaire, donc la règle ci-dessus suffit une fois la conversation relue. L'ensemble `messaged` de la session couvre le délai avant que WME ne la montre (Ctrl+Z, cache) |
| Case à cocher | 4ᵉ case, « Map Mate : demander des précisions », **décochée par défaut** puisqu'elle envoie des messages |
| Radar via Map Mate | `MISSING_STATIC_SPEED_CAMERA` reste un radar : message officiel et fermeture, jamais cette question |

### 2.1 Les cas

| Code | Cas | Question |
| --- | --- | --- |
| `MISSING_TRAFFIC_LIGHT` | Feu | Où est le feu, est-il permanent ? Si c'était un feu de chantier, signaler des travaux |
| `INCORRECT_ROUTE` | Itinéraire | Quel trajet, où était le conducteur au moment du problème, ce qu'il attendait, ce qu'il a eu |
| `INCORRECT_SPEED_LIMIT` | Vitesse | Sur quel tronçon (de où à où), quelle est la bonne limitation, changement local récent ? |
| `INCORRECT_TURN` | Virage | Sur quelle rue il roulait, dans laquelle il voulait tourner, où il a vraiment tourné |
| `RAILROAD_CROSSING` | Passage à niveau | En Suisse, pas indiqué sur la carte par défaut, sauf s'il est vraiment dangereux ; si c'est le cas, nous le dire (où, et pourquoi) |
| `GENERAL_MAP_UPDATE` | Général | Où exactement, et quelle modification de la carte |

### 2.2 Feux : partage avec les feux sur autoroute

Seul le cas « Feu » dépend de la route. Les feux Map Mate se partagent entre deux familles
selon **une seule règle**, la route la plus proche dans un rayon de `FREEWAY_MAX_DISTANCE_M`
(`closestRoadType`, detect.ts) :

| Route la plus proche | Famille |
| --- | --- |
| Autoroute | « Feux sur autoroute » : probablement un radar, fermé sans message, **aucune question** |
| Chargée, autre qu'une autoroute (bretelle comprise) | « Map Mate » : question du cas « Feu » |
| Aucune route chargée | Aucune des deux, en attente |

La question « Feu » est donc exactement le reste de ce que traite le cas autoroute. Un UR ne
peut pas être dans les deux, et un feu dont on ne connaît pas encore la route ne reçoit
jamais la question. `askMapMate` refait ce test juste avant d'envoyer.

Les autres cas ne regardent pas la route.

## 3. Les messages

Chaque message est fait de trois parties, séparées par une ligne vide :
- l'intro commune `askIntro` ;
- le corps du cas, `askBody<Cas>` ;
- la signature déjà utilisée pour les radars, `messageSignature`.

Pour éviter les doublons, on reconnaît le **corps** mot pour mot. L'intro pourra donc être
reformulée plus tard sans rien casser.

- `buildMapMateQuestion(kind, lang)` construit le texte.
- `isMapMateQuestion(text)` est vrai si le corps de **n'importe quel** cas, dans
  **n'importe quelle** langue, figure dans le commentaire, espaces normalisés (même règle que
  `isOfficialMessage`).

### Intro (`askIntro`)

| | |
| --- | --- |
| FR | Bonjour,\n\nMerci pour votre signalement. |
| DE | Guten Tag,\n\nDanke für Ihre Meldung. |
| IT | Buongiorno,\n\nGrazie per la segnalazione. |
| EN | Hello,\n\nThank you for your report. |

### Corps

**Feu (`askBodyTrafficLight`)**
- FR : Pourriez-vous nous en dire plus sur ce feu ? Où se trouve-t-il exactement (carrefour, rue, sens de circulation), et s'agit-il d'un feu permanent ?\n\nS'il s'agissait d'un feu de chantier provisoire, il vaut mieux signaler des travaux dans l'application Waze : les autres conducteurs en sont avertis tout de suite.
- DE : Können Sie uns mehr über diese Ampel sagen? Wo genau steht sie (Kreuzung, Strasse, Fahrtrichtung), und ist sie dauerhaft?\n\nFalls es sich um eine provisorische Baustellenampel handelte, melden Sie besser eine Baustelle in der Waze-App: So werden andere Fahrer sofort gewarnt.
- IT : Potrebbe dirci di più su questo semaforo? Dove si trova esattamente (incrocio, via, senso di marcia) ed è permanente?\n\nSe si trattava di un semaforo di cantiere provvisorio, è meglio segnalare dei lavori nell'app Waze: gli altri conducenti vengono avvisati subito.
- EN : Could you tell us more about this traffic light? Where exactly is it (junction, street, direction of travel), and is it a permanent one?\n\nIf it was a temporary roadworks light, it is better to report roadworks in the Waze app: other drivers are warned right away.

**Itinéraire (`askBodyRoute`)**
- FR : Pourriez-vous nous en dire plus sur ce trajet ? D'où veniez-vous et où alliez-vous, où vous trouviez-vous quand le problème est survenu, quel itinéraire attendiez-vous et lequel Waze vous a-t-il proposé ?
- DE : Können Sie uns mehr über diese Fahrt sagen? Woher kamen Sie und wohin wollten Sie, wo befanden Sie sich, als das Problem auftrat, welche Route haben Sie erwartet und welche hat Waze Ihnen vorgeschlagen?
- IT : Potrebbe dirci di più su questo tragitto? Da dove veniva e dove andava, dove si trovava quando si è verificato il problema, quale percorso si aspettava e quale le ha proposto Waze?
- EN : Could you tell us more about this trip? Where were you coming from and going to, where were you when the problem happened, which route did you expect and which one did Waze suggest?

**Vitesse (`askBodySpeedLimit`)**
- FR : Pourriez-vous nous en dire plus sur cette limitation de vitesse ? Sur quel tronçon est-elle fausse (de où à où), quelle est la bonne limitation, et savez-vous si elle a changé récemment, par exemple suite à une décision locale ?
- DE : Können Sie uns mehr über diese Geschwindigkeitsbegrenzung sagen? Auf welchem Abschnitt ist sie falsch (von wo bis wo), welche ist die richtige, und wissen Sie, ob sie kürzlich geändert wurde, zum Beispiel durch einen lokalen Entscheid?
- IT : Potrebbe dirci di più su questo limite di velocità? Su quale tratto è sbagliato (da dove a dove), qual è il limite corretto, e sa se è cambiato di recente, per esempio in seguito a una decisione locale?
- EN : Could you tell us more about this speed limit? On which stretch is it wrong (from where to where), what is the correct limit, and do you know whether it changed recently, for example after a local decision?

**Virage (`askBodyTurn`)**
- FR : Pourriez-vous nous en dire plus sur ce virage ? Sur quelle rue rouliez-vous, dans quelle rue vouliez-vous tourner, et où avez-vous effectivement tourné ?
- DE : Können Sie uns mehr über dieses Abbiegen sagen? Auf welcher Strasse waren Sie unterwegs, in welche Strasse wollten Sie abbiegen, und wo sind Sie tatsächlich abgebogen?
- IT : Potrebbe dirci di più su questa svolta? Su quale strada stava viaggiando, in quale strada voleva svoltare e dove ha effettivamente svoltato?
- EN : Could you tell us more about this turn? Which street were you driving on, which street did you want to turn into, and where did you actually turn?

**Général (`askBodyGeneral`)**
- FR : Pourriez-vous nous en dire plus ? Où se trouve exactement l'endroit concerné, et quelle modification faudrait-il apporter à la carte ?
- DE : Können Sie uns mehr dazu sagen? Wo genau befindet sich die betroffene Stelle, und was sollte auf der Karte geändert werden?
- IT : Potrebbe dirci di più? Dove si trova esattamente il luogo interessato e quale modifica andrebbe apportata alla mappa?
- EN : Could you tell us more? Where exactly is the place concerned, and what change should be made to the map?

## 4. Architecture

Pas de nouveau module.

| Fichier | Changement |
| --- | --- |
| `detect.ts` | `MapMateKind = "trafficLight" \| "route" \| "speedLimit" \| "turn" \| "general"`. `descriptionCode(ur)` (texte avant le premier `:`). `mapMateKind(ur): MapMateKind \| null` : ouvert, éditable, source, type et code connu, sinon `null`. Pur, sans géométrie ni conversation. `closestRoadType` devient exporté |
| `message.ts` | `buildMapMateQuestion(kind, lang)`, `isMapMateQuestion(text)` |
| `settings.ts` | `criteria.mapMate`, défaut `false`. La fusion existante donne `false` aux réglages déjà sauvegardés ; la version reste 1 |
| `scanner.ts` | Nouvelle liste `mapMate: MapMateEntry[]` (`UrEntry` + `kind`). Candidats = `mapMateKind(ur) !== null`, et pour un feu, `isKnownOffFreeway`. Conversations lues **seulement si la case est cochée**, après les radars et avant les abandonnés. État `pending` puis `ready` ; un UR avec un commentaire (hors `Map_Team`) ou déjà questionné disparaît de la liste. Même cache, même invalidation et même abandon d'un balayage dépassé |
| `close.ts` | `askMapMate(sdk, id)` (pas d'option pour forcer : un commentaire bloque toujours), `runAskMapMate()`. `BatchRequest` gagne `mapMate`. `allowedBatch`, `capBatch` et `closeMany` le traitent au niveau 3, entre radars et abandonnés. `CloseOutcome` gagne `"asked"` |
| `confirm-spec.ts` | `ConfirmSpec.quotes` devient une **liste** de blocs. `askMapMateSpec(id, kind, lang)`. `closeSelectedSpec` ajoute une ligne de famille et un bloc de citation par cas présent |
| `ui/dialog.ts` | Rend chaque bloc de citation, avec ses drapeaux |
| `ui/format.ts` | `selectedBatch` et le total du bouton incluent `mapMate`. Libellé de ligne avec le cas (« Feu », « Itinéraire »…) |
| `ui/tab.ts` | 4ᵉ case, section « Map Mate (N) », bouton par ligne |
| i18n / locales | Intro, cinq corps, cinq libellés de cas, chaînes d'interface, dans les quatre langues |

### 4.1 Résultat d'une question

Un UR questionné n'est pas fermé, et `"closed"` serait donc faux. `CloseOutcome` gagne le
résultat `"asked"`.

`summarize` ajoute « N question(s) envoyée(s) » quand il y en a. Le rappel de sauvegarde
n'apparaît que si quelque chose a été fermé : une question seule ne laisse rien à
sauvegarder. Si le résumé ne contient que des questions, il précise que les messages sont
déjà partis et qu'il n'y a rien à sauvegarder (nouvelle clé `askedReminder`).

### 4.2 Écriture

`askMapMate(sdk, id)` relit tout juste avant d'écrire :

1. édition autorisée, sinon `errNotAllowed` ;
2. l'UR existe et `mapMateKind(ur)` n'est pas `null`, sinon `skipGone`. Le cas est relu ici :
   c'est lui qui choisit le texte ;
3. pour un feu, route connue et hors autoroute, sinon `skipGone` ;
4. même verrou `inFlight` que `closeOne` ;
5. conversation relue, échec → `errDetails` ;
6. un commentaire autre que `Map_Team` (`hasDiscussion`) ou déjà questionné cette session
   (`wasMessaged`) → `skipConversation`. Aucune exception, ni en lot ni un par un ;
7. `addComment(buildMapMateQuestion(kind, lang))`, échec → `errComment`. En cas de
   succès, `noteMessaged(id)` et le résultat est `"asked"`.

`updateResolutionState` n'est **jamais** appelé.

### 4.3 Confirmations

- **Un UR** : titre `#id` et cas ; faits « le message ci-dessous part maintenant », « l'UR
  reste ouvert pour sa réponse » ; citation du texte exact ; avertissement « ne peut pas être
  retiré ». Bouton « Envoyer ». Pas de dernier commentaire à montrer : un UR qui en a un
  n'arrive pas jusque-là.
- **Lot** :
  - une ligne par famille, par exemple « 7 Map Mate : question envoyée maintenant, l'UR
    reste ouvert » ;
  - un bloc de citation par texte présent : le message radar, puis chaque cas Map Mate
    présent, chacun avec ses langues ;
  - un avertissement dès qu'un message part.

### 4.4 Onglet

Les cases, dans l'ordre : Radars, Feux sur autoroute, Map Mate : demander des précisions,
Abandonnés.

La section « Map Mate (N) » vient après les feux sur autoroute. Sa description est dans le
« (i) » de sa case (§4.6). Chaque ligne affiche le cas : `#id · Feu · FR · date`. Les
lignes `pending` n'ont pas de bouton. Il n'y a pas de lignes « conversation » : un UR
commenté n'est pas listé.

### 4.5 L'onglet change de nom et de contenu

L'onglet n'est plus seulement celui des radars : il traite désormais quatre familles d'UR.
Son nom, son titre, sa note et sa bannière le disent.

| Clé | FR | DE | IT | EN |
| --- | --- | --- | --- | --- |
| `tabName` (préfixé `CH · `) | Assistant UR | UR-Assistent | Assistente UR | UR assistant |
| `appName` (titre dans l'onglet) | Assistant des UR | Assistent für URs | Assistente per le UR | Update request assistant |

**Note en tête d'onglet (`tabNote`)** : une ligne courte. Le détail de chaque famille passe
dans son « (i) » (§4.6).
- FR : Traite les UR ouverts à l'écran, selon les familles cochées ci-dessous. Rien n'est sauvegardé automatiquement.
- DE : Bearbeitet die offenen URs im Bildausschnitt, nach den unten angekreuzten Gruppen. Nichts wird automatisch gespeichert.
- IT : Tratta le UR aperte sullo schermo, secondo le famiglie selezionate qui sotto. Nulla viene salvato automaticamente.
- EN : Handles the open URs on screen, by the families ticked below. Nothing is saved automatically.

**Bannière.** Elle compte toutes les familles cochées, plus seulement les radars :
« N UR à traiter à l'écran, M en vérification ». Sans aucune famille cochée, elle invite à
en cocher une. Sans UR, elle garde le rappel actuel : les UR doivent être affichés sur la
carte pour être trouvés. Les clés `stateNone`, `stateFound` et `statePending` changent de
texte dans les quatre langues, et `stateNoFamily` s'ajoute.

**Ce qui ne change pas, exprès :**
- le dossier `src/speed-camera-urs/` et la section i18n `speedCameraUrs` : les renommer
  toucherait tout le code sans rien apporter à l'éditeur ;
- le `scriptId` `wme-ch-speed-camera-urs` et la clé de regroupement des onglets
  (`groupScriptTab`) : c'est ce qui relie l'onglet à sa place parmi nos onglets ;
- la clé `localStorage` `wme-ch-speed-camera-urs.settings`, pour que les cases déjà
  cochées survivent à la mise à jour.

`SCRIPT_NAME` devient « WME CH UR Assistant ».

### 4.6 Un « (i) » au bout de chaque case

Chaque case porte, en bout de ligne, un petit « (i) ». Le survoler (ou y arriver au clavier)
affiche la description de la famille. Ces textes remplacent les notes en haut des sections,
pour qu'ils ne soient écrits qu'à un seul endroit.

| Case | Clé | Contenu |
| --- | --- | --- |
| Radars | `speedCameraInfo` | L'ancien `tabNote` : commente et ferme en Non identifié les UR `MISSING_STATIC_SPEED_CAMERA` ; la loi suisse interdit d'afficher les radars fixes ; chaque utilisateur reçoit l'explication officielle dans sa langue |
| Feux sur autoroute | `trafficLightNote` (renommée `trafficLightInfo`) | Texte actuel, inchangé |
| Map Mate | `mapMateInfo` | Les signalements vocaux Map Mate reçoivent une question adaptée au cas (feu, itinéraire, vitesse, virage, général) dans la langue du rapporteur ; l'UR reste ouvert ; rien n'est envoyé dès qu'il y a eu un commentaire |
| Abandonnés | `staleNote` (renommée `staleInfo`) | Texte actuel, inchangé |

`conversationNote`, dans la section radars « Déjà une conversation », reste où elle est : elle
explique cette sous-liste, pas la famille.

**Rendu.**
- Le « (i) » est l'icône `w-icon-info` de la police Waze (le contour, plus discret que
  `w-icon-info-fill`), via `icon("info")` de `src/ui/dom.ts`. Elle est dans un `<span
  class="scu-info">` qui porte l'infobulle : l'icône elle-même reste décorative
  (`aria-hidden`), comme partout ailleurs.
- La case et le « (i) » sont posés côte à côte dans une ligne (`.scu-criterion-row`). Le
  « (i) » n'est **pas** dans le libellé de la case : cliquer dessus ne coche ni ne décoche
  rien.
- Le texte passe dans l'attribut `title`, pour l'infobulle native du navigateur au survol.
  Il passe aussi dans `aria-label`, avec `tabindex="0"`, pour le clavier et les lecteurs
  d'écran.
- Sur écran tactile, l'infobulle native ne s'affiche pas. C'est accepté : WME s'utilise
  essentiellement à la souris.

**Tests (`ui/criteria.test.ts`)** :
- le « (i) » porte le texte dans `title` et `aria-label` ;
- il est focalisable ;
- il est hors du libellé, et le cliquer ne déclenche pas `onChange`.

## 5. Erreurs

Les mêmes raisons qu'aujourd'hui. Un échec d'envoi (`errComment`) ne laisse rien derrière
lui, puisque rien d'autre n'est écrit.

## 6. Tests

- `detect.test.ts` :
  - `descriptionCode` : avec et sans `:` ;
  - `mapMateKind` : chaque code ; code inconnu ; code suffixé (`INCORRECT_TURN_X`) ; autre
    source ; autre type ; UR fermé ou non éditable ; radar Map Mate → `null`.
- `message.test.ts` :
  - les cinq cas dans les quatre langues ;
  - la signature ;
  - `isMapMateQuestion` : espaces normalisés, aucune confusion avec le message radar.
- `settings.test.ts` : `mapMate` à `false` par défaut, y compris pour un ancien réglage sans
  ce champ.
- `scanner.test.ts` :
  - rien n'est lu tant que la case est décochée ;
  - feu sur autoroute ou route non chargée exclus, autres cas indépendants de la route ;
  - UR commenté (hors `Map_Team`) ou déjà questionné exclu ;
  - ordre des lectures.
- `close.test.ts` :
  - `askMapMate` envoie le texte du bon cas sans fermer ;
  - jamais deux fois ;
  - un commentaire d'une autre personne que `Map_Team` bloque l'envoi, en lot **et** un par
    un ; un commentaire `Map_Team` seul ne bloque pas ;
  - un commentaire arrivé pendant que la confirmation est ouverte bloque l'envoi ;
  - un feu reclassé sur autoroute est refusé ;
  - rang et plafond partagés, ordre dans le lot.
- `confirm-spec.test.ts` / `flows.test.ts` / `ui/dialog.test.ts` : citations multiples, lot
  mixte, résumé avec « asked ».
- `ui/format.test.ts` : bouton selon la case et le niveau, libellé de ligne avec le cas,
  bannière selon les familles cochées (aucune, sans UR, avec UR en vérification).

## 7. À vérifier dans WME

- Un UR Map Mate questionné : le texte apparaît bien côté rapporteur, et l'UR reste ouvert.
- Les codes réels de `INCORRECT_ROUTE`, `INCORRECT_SPEED_LIMIT`, `INCORRECT_TURN` et
  `GENERAL_MAP_UPDATE` sur des UR réels. Seul `MISSING_TRAFFIC_LIGHT` a été observé ; un
  code mal orthographié ici ne fait rien, sans danger.
- Que `REPORTING_AGENT` ne désigne que Map Mate.

## 8. Documentation

- `CLAUDE.md`, section *Speed-camera URs* :
  - la famille et ses cinq cas ;
  - l'UR qui reste ouvert, et aucune question dès qu'il y a eu un commentaire (hors `Map_Team`) ;
  - le partage des feux avec l'autoroute ;
  - le lot au niveau 3 et l'anti-doublon.
- Les quatre README :
  - compléter l'entrée *Added* de la version en cours ;
  - ajouter une entrée *Changed* pour le nouveau nom de l'onglet ;
  - mettre à jour la description de la fonctionnalité dans la liste *Features*, qui
    nomme l'onglet.

## 9. Hors périmètre

- Relancer un rapporteur qui n'a pas répondu.
- Fermer automatiquement après une réponse.
- Codes Map Mate autres que les cinq listés.
- UR non Map Mate de ces mêmes types.
