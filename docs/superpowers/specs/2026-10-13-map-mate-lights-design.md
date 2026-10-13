# Feux Map Mate hors autoroute : demander des précisions

Date : 2026-10-13
Branche : `feat/stale-urs` (suite directe des UR abandonnés)
Périmètre : `src/speed-camera-urs/`, `locales/*/common.json`, les quatre README, `CLAUDE.md`

## 1. Pourquoi

Map Mate, le signalement vocal de Waze, crée des UR `MISSING_TRAFFIC_LIGHT` (source
`REPORTING_AGENT`, observé sur l'UR 27002003). Hors autoroute, ces feux peuvent être réels,
mais la description générée ne dit ni où ils se trouvent ni s'ils sont permanents. Souvent,
c'est un feu de chantier provisoire, qui devrait être signalé comme des travaux.

On veut donc envoyer une question au rapporteur, dans sa langue, et laisser l'UR ouvert
pour qu'il puisse répondre.

## 2. Ce qui est décidé

| Question | Décision |
| --- | --- |
| Famille | UR ouvert, éditable, `source === "REPORTING_AGENT"`, description qui commence par `MISSING_TRAFFIC_LIGHT`, route la plus proche **chargée et différente d'une autoroute** (`isKnownOffFreeway`) |
| Action | Le message part dans la langue du rapporteur. **L'UR reste ouvert.** Rien d'autre n'est écrit |
| Un par un | Bouton « Demander des précisions » sur chaque ligne, ouvert à tous les niveaux, avec confirmation qui cite le texte exact |
| Lot | Dans le bouton unique, au **niveau 3** (`BATCH_MIN_RANK`), comme les radars |
| Ordre dans le lot | Radars, puis feux Map Mate, puis abandonnés. `BATCH_CAP` (50) reste partagé |
| Déjà questionné | Jamais deux fois. Reconnu par le texte dans la conversation (quatre langues) ou par l'ensemble `messaged` de la session. Un UR déjà questionné sort de la liste : il attend la réponse |
| Conversation existante | Tout commentaire d'une autre personne que `Map_Team` exclut l'UR du lot. Il reste possible de l'envoyer depuis sa ligne, et la confirmation montre alors le dernier commentaire |
| Case à cocher | 4ᵉ case, « Feux Map Mate hors autoroute », **décochée par défaut** puisqu'elle envoie des messages |
| Feu Map Mate sur autoroute | **Jamais de question** : c'est probablement un radar. Il reste dans « Feux sur autoroute », fermé un par un sans message |
| Route pas encore chargée | L'UR attend, il n'est listé nulle part. Même règle que pour les abandonnés |
| Source | Seulement Map Mate. Un feu signalé à la main dans l'app, hors autoroute, n'est pas concerné |

### 2.1 Partage avec les feux sur autoroute

Les deux familles se partagent les feux Map Mate selon **une seule règle**, la route la plus
proche dans un rayon de `FREEWAY_MAX_DISTANCE_M` (`closestRoadType`, detect.ts) :

| Route la plus proche | Famille |
| --- | --- |
| Autoroute | « Feux sur autoroute » : fermé sans message, aucune question |
| Chargée, autre qu'une autoroute (bretelle comprise) | « Feux Map Mate hors autoroute » : question |
| Aucune route chargée | Aucune des deux, en attente |

La famille « question » est donc exactement le reste de ce que traite le cas autoroute. Un
UR ne peut pas être dans les deux, et un feu dont on ne connaît pas encore la route ne reçoit
jamais la question, puisque ce pourrait être un radar. `askLight` refait ce test juste avant
d'envoyer : une route reclassée en autoroute entre-temps bloque l'envoi (`skipGone`).

## 3. Le message

Construit comme celui des radars : une intro, un corps et la signature existante
(`messageSignature`). Le **corps** est reconnu mot pour mot pour éviter les doublons ; l'intro
peut être reformulée plus tard sans rien casser.

- `lightQuestionIntro`, `lightQuestionBody` : nouvelles clés sous `speedCameraUrs`.
- `buildLightQuestion(lang)` = intro + corps + signature, séparés par des lignes vides.
- `isLightQuestion(text)` : le corps de l'une des quatre langues figure dans le commentaire,
  espaces normalisés (même règle que `isOfficialMessage`).

**FR**
> Bonjour,
>
> Merci pour votre signalement d'un feu de circulation manquant.
>
> Pourriez-vous nous en dire plus ? Où se trouve exactement ce feu (carrefour, rue, sens de circulation), et s'agit-il d'un feu permanent ?
>
> S'il s'agissait d'un feu de chantier provisoire, il vaut mieux signaler des travaux dans l'application Waze : les autres conducteurs en sont avertis tout de suite.
>
> Belle journée et bonne route.
> La communauté des éditeurs bénévoles

**DE**
> Guten Tag,
>
> Danke für Ihre Meldung einer fehlenden Ampel.
>
> Können Sie uns mehr dazu sagen? Wo genau steht diese Ampel (Kreuzung, Strasse, Fahrtrichtung), und ist sie dauerhaft?
>
> Falls es sich um eine provisorische Baustellenampel handelte, melden Sie besser eine Baustelle in der Waze-App: So werden andere Fahrer sofort gewarnt.
>
> Einen schönen Tag und gute Fahrt.
> Die Community der freiwilligen Editoren

**IT**
> Buongiorno,
>
> Grazie per la segnalazione di un semaforo mancante.
>
> Potrebbe darci qualche dettaglio in più? Dove si trova esattamente questo semaforo (incrocio, via, senso di marcia) ed è permanente?
>
> Se si trattava di un semaforo di cantiere provvisorio, è meglio segnalare dei lavori nell'app Waze: gli altri conducenti vengono avvisati subito.
>
> Buona giornata e buon viaggio.
> La comunità degli editor volontari

**EN**
> Hello,
>
> Thank you for reporting a missing traffic light.
>
> Could you tell us more? Where exactly is this light (junction, street, direction of travel), and is it a permanent one?
>
> If it was a temporary roadworks light, it is better to report roadworks in the Waze app: other drivers are warned right away.
>
> Have a nice day and safe travels.
> The volunteer editor community

Dans chaque langue, l'intro va jusqu'à « …manquant. » et le corps couvre les deux paragraphes
suivants.

## 4. Architecture

Pas de nouveau module.

| Fichier | Changement |
| --- | --- |
| `detect.ts` | `isMapMateLightCandidate(ur)` : ouvert, éditable, `source === MAP_MATE_SOURCE`, préfixe `TRAFFIC_LIGHT_PREFIX`. Pur, sans géométrie ni conversation |
| `message.ts` | `buildLightQuestion(lang)`, `isLightQuestion(text)` |
| `settings.ts` | `criteria.lightQuestion`, défaut `false`. La fusion existante donne `false` aux réglages déjà sauvegardés ; la version reste 1 |
| `scanner.ts` | Nouvelle liste `lightQuestions: UrEntry[]` (triage `pending` / `ready` / `conversation`). Candidats = `isMapMateLightCandidate && isKnownOffFreeway`. Conversations lues **seulement si la case est cochée**, après les radars et avant les abandonnés. Un UR déjà questionné (`alreadyAsked`) n'est pas listé. Même cache, même invalidation et même abandon d'un balayage dépassé |
| `close.ts` | `askLight(sdk, id, { allowConversation })`, `alreadyAsked(id, comments)`, `runAskLight()`. `BatchRequest` gagne `lightQuestion`. `allowedBatch`, `capBatch` et `closeMany` le traitent au niveau 3, entre radars et abandonnés. `summarize` compte les questions envoyées |
| `confirm-spec.ts` | `ConfirmSpec.quotes` devient une **liste** de blocs (un par texte cité). `askLightSpec(id, lang, lastComment)`. `closeSelectedSpec` prend aussi les langues des feux et ajoute une ligne de famille et un bloc de citation |
| `ui/dialog.ts` | Rend chaque bloc de citation, avec ses drapeaux |
| `ui/format.ts` | `selectedBatch` et le total du bouton incluent `lightQuestion` |
| `ui/tab.ts` | 4ᵉ case, section « Feux Map Mate hors autoroute (N) », bouton par ligne |
| i18n / locales | Nouvelles chaînes, dans les quatre langues |

### 4.1 Résultat d'une question

Un UR questionné n'est pas fermé, et `"closed"` serait donc faux. `CloseOutcome` gagne le
résultat `"asked"`.

`summarize` ajoute alors « N question(s) envoyée(s) » quand il y en a. Le rappel de
sauvegarde n'apparaît que si quelque chose a été fermé : une question seule ne laisse rien à
sauvegarder. Si le résumé ne contient que des questions, il précise que les messages sont
déjà partis et qu'il n'y a rien à sauvegarder (nouvelle clé `askedReminder`).

### 4.2 Écriture

`askLight(sdk, id, { allowConversation })` relit tout juste avant d'écrire :

1. édition autorisée, sinon `errNotAllowed` ;
2. l'UR existe et passe `isMapMateLightCandidate`, sinon `skipGone` ;
3. route connue et hors autoroute, sinon `skipGone` ;
4. même verrou `inFlight` que `closeOne` ;
5. conversation relue, échec → `errDetails` ;
6. déjà questionné → `skipConversation` (même avec `allowConversation`, jamais deux fois) ;
7. discussion (`hasDiscussion`) et `!allowConversation` → `skipConversation` ;
8. `addComment(buildLightQuestion(lang))`, échec → `errComment`. En cas de succès, `noteMessaged(id)` et le résultat est `"asked"`.

`updateResolutionState` n'est **jamais** appelé.

### 4.3 Confirmations

- **Un feu** : titre `#id`, faits « le message ci-dessous part maintenant », « l'UR reste
  ouvert pour sa réponse » ; citation du texte exact ; dernier commentaire s'il y en a ;
  avertissement « ne peut pas être retiré ». Bouton « Envoyer ».
- **Lot** : une ligne par famille, par exemple « 3 feu(x) Map Mate : question envoyée
  maintenant, l'UR reste ouvert ». Un bloc de citation par texte présent (radars, feux),
  chacun avec ses langues. Avertissement dès qu'un message part.

### 4.4 Onglet

Les cases, dans l'ordre : Radars, Feux sur autoroute, Feux Map Mate hors autoroute,
Abandonnés.

La section « Feux Map Mate hors autoroute (N) » vient après les feux sur autoroute. Sa note
explique la famille et dit que l'UR reste ouvert. Les lignes `pending` n'ont pas de bouton.
Les lignes `conversation` portent la mention « conversation » et gardent leur bouton, mais
n'entrent pas dans le lot.

## 5. Erreurs

Les mêmes raisons qu'aujourd'hui. Un échec d'envoi (`errComment`) ne laisse rien derrière
lui, puisque rien d'autre n'est écrit.

## 6. Tests

- `detect.test.ts` : `isMapMateLightCandidate`, avec la bonne source et le bon préfixe ;
  rejet d'une autre source, d'un radar, d'un UR fermé.
- `message.test.ts` : le texte dans les quatre langues, la signature, `isLightQuestion`
  (espaces normalisés, aucune confusion avec le message radar).
- `settings.test.ts` : `lightQuestion` à `false` par défaut, y compris pour un ancien réglage
  sans ce champ.
- `scanner.test.ts` : rien n'est lu tant que la case est décochée ; feu sur autoroute ou
  route non chargée exclus ; autre source exclue ; déjà questionné exclu ; ordre des
  lectures.
- `close.test.ts` : `askLight` envoie sans fermer ; jamais deux fois ; un commentaire
  bloque l'envoi en lot ; rang et plafond partagés ; ordre dans le lot.
- `confirm-spec.test.ts` / `flows.test.ts` / `ui/dialog.test.ts` : citations multiples,
  lot mixte, résumé avec « asked ».
- `ui/format.test.ts` : bouton selon la case et le niveau.

## 7. À vérifier dans WME

- Un UR Map Mate avec un commentaire : le texte apparaît bien côté rapporteur, et l'UR reste
  ouvert.
- Que `REPORTING_AGENT` ne désigne que Map Mate (vérifié sur un UR, pas sur un échantillon).

## 8. Documentation

- `CLAUDE.md`, section *Speed-camera URs* : la famille, l'UR qui reste ouvert, le lot au
  niveau 3 et l'anti-doublon.
- Les quatre README : compléter l'entrée *Added* de la version en cours.

## 9. Hors périmètre

- Relancer un rapporteur qui n'a pas répondu.
- Fermer automatiquement après une réponse.
- Feux Map Mate sur autoroute : inchangés.
