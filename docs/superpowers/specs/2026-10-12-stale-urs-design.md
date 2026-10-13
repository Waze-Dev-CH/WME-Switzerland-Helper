# UR abandonnés et sélection par critères

Date : 2026-10-12
Branche : `feat/stale-urs`
Périmètre : `src/speed-camera-urs/`, `locales/*/common.json`, les quatre README, `CLAUDE.md`

## 1. Pourquoi

L'onglet ferme aujourd'hui deux familles d'UR : les radars fixes (message officiel puis
fermeture) et les feux signalés sur autoroute (fermeture sans message, un par un). Une
troisième famille encombre la carte bien plus que ces deux-là : les UR restés sans réponse
depuis des semaines, quel que soit leur type. Personne ne leur a parlé, le rapporteur ne
reviendra pas, et les fermer à la main est répétitif.

Deuxième besoin : choisir, avec des cases à cocher, quelles familles l'onglet prend en
compte, pour que le lot ferme exactement ce que l'éditeur a choisi.

## 2. Ce qui est décidé

| Question | Décision |
| --- | --- |
| Critère « abandonné » | UR ouvert, éditable, **aucune activité depuis plus de 14 jours** (dernier commentaire, ou signalement sans commentaire), et le dernier mot n'est pas au rapporteur (`userName === null`). *Révisé le 2026-10-13 : la version initiale exigeait « aucun commentaire sauf Map_Team », ce qui excluait les relances d'éditeurs restées sans réponse.* |
| Types concernés | Tous les types d'UR |
| Reconnaissance de `Map_Team` | `comment.userName === "Map_Team"`, égalité exacte. Un `userName` `null` compte comme une discussion (prudence) |
| Fermeture | `not-identified`, **sans message** |
| Fermeture un par un | Ouverte à tous les niveaux, avec confirmation |
| Lot « abandonnés » | Niveau 4 minimum (`STALE_BATCH_MIN_RANK = 3`), bouton caché en dessous |
| Lot « radars » | Inchangé : niveau 3 (`BATCH_MIN_RANK = 2`) |
| Feux sur autoroute | Inchangé : jamais de lot. La case ne fait qu'afficher ou masquer leur section |
| Bouton de lot | **Un seul**, « Fermer les N UR sélectionnés », sur tout ce qui est coché et autorisé au niveau de l'éditeur |
| Plafond | `BATCH_CAP` (50) pour l'ensemble du lot, radars d'abord |
| Chevauchement radar / abandonné | Un radar est toujours un radar : message envoyé. Il n'entre jamais dans « abandonnés », même case radars décochée |
| Chevauchement feu sur autoroute / abandonné | Un feu sur autoroute reste un feu : jamais dans « abandonnés », sinon il entrerait dans un lot par la bande. Un feu **hors** autoroute peut être abandonné comme n'importe quel UR |
| Persistance des cases | `localStorage`, clé `wme-ch-speed-camera-urs.settings` |
| Défauts | Radars ☑, feux ☑, abandonnés ☐ |
| Composant | `<wz-checkbox>` natif de WME, repli sur `<input type="checkbox">` stylé s'il n'émet pas d'événement exploitable |

Pourquoi « abandonnés » est décoché par défaut : la case déclenche la lecture de la
conversation de chaque UR ancien à l'écran (un aller-retour serveur par UR), et elle élargit
beaucoup ce qu'un clic peut fermer. On l'active en connaissance de cause.

## 3. API utilisées

Rien de nouveau côté SDK : `MapUpdateRequests.getAll()`, `getById()`,
`getUpdateRequestDetails()` et `updateResolutionState()`, déjà utilisés. `addComment()` n'est
jamais appelé pour un UR abandonné.

`<wz-checkbox>` n'est pas décrit dans `wme-sdk-typings`. Comme `<wz-button>` dans
`src/reloadButton.ts`, c'est un composant de l'interface de WME, pas une API du SDK : il
sert de rendu, l'état vit dans nos réglages. À vérifier dans WME avant d'en dépendre (voir 7).

## 4. Architecture

Pas de nouveau module : tout reste dans `src/speed-camera-urs/`.

| Fichier | Changement |
| --- | --- |
| `detect.ts` | `STALE_AGE_DAYS = 14`, `MAP_TEAM_USER = "Map_Team"`. `isStaleCandidate(ur, now)` : ouvert, éditable, assez vieux, pas un radar (pur, sans conversation). `hasDiscussion(comments)` : au moins un commentaire dont `userName !== MAP_TEAM_USER` |
| `settings.ts` (nouveau) | `loadSettings()` / `saveSettings()`, `{ version: 1, criteria: { speedCamera, trafficLight, stale } }`. Fusion avec les défauts, `try/catch` autour de `localStorage`, un JSON illisible rend les défauts |
| `scanner.ts` | Nouvelle liste `stale: StaleEntry[]` dans `ScanSnapshot`. Candidats = `isStaleCandidate` moins les feux sur autoroute. Conversations lues **seulement si la case est cochée**, après celles des radars. Même cache, même invalidation sur `objects-changed`, même abandon d'un balayage dépassé |
| `close.ts` | `STALE_BATCH_MIN_RANK = 3`, `canBatchStale()`, `closeStale()`, `runCloseStale()`, `runCloseSelected()`. `closeMany` prend `{ speedCamera, stale }` et vérifie les deux rangs lui-même |
| `confirm-spec.ts` | `closeStaleSpec(id, ageDays)` et `closeSelectedSpec(...)` qui détaille le lot par famille |
| `ui/format.ts` | Libellé des lignes abandonnées (âge en jours), libellé et visibilité du bouton unique |
| `ui/tab.ts` | Bloc des trois cases sous la bannière, section « Abandonnés », bouton unique |
| `ui/styles.ts` | Mise en page du bloc de cases |
| `i18n` / locales | Nouvelles chaînes sous `speedCameraUrs`, dans les quatre langues |

### 4.1 Détection

`isStaleCandidate` ne regarde que le modèle de données, sans réseau :

```
ur.isOpen && ur.isEditable
&& now - ur.reportedOn > STALE_AGE_DAYS jours
&& !description.startsWith(SPEED_CAMERA_PREFIX)
```

Le scanner retire ensuite les feux sur autoroute (`isTrafficLightUr && isOnFreeway`). Le
verdict final demande la conversation : abandonné si `!hasDiscussion(comments)` et
`!wasMessaged(id)`. Tant que la conversation n'est pas lue, l'entrée est `pending` et n'a
pas de bouton, comme les radars aujourd'hui.

### 4.2 Écriture

`closeStale(sdk, id)` relit tout juste avant d'écrire, comme `closeOne` et
`closeTrafficLight` :

1. édition autorisée, sinon `errNotAllowed` ;
2. l'UR existe et passe encore `isStaleCandidate`, sinon `skipGone` ;
3. ce n'est pas un feu sur autoroute, sinon `skipGone` ;
4. conversation relue, échec → `errDetails` ; discussion apparue → `skipConversation` ;
5. `updateResolutionState("not-identified")`, échec → `errClose`.

Même verrou `inFlight` que `closeOne`, pour qu'un double clic ne lance pas deux lectures.

`closeMany(sdk, { speedCamera, stale })` :

- rend `null` si l'éditeur n'a le rang pour **aucune** des deux familles demandées ;
- vide la famille pour laquelle il n'a pas le rang, sans rien écrire ;
- coupe à `BATCH_CAP` au total, radars d'abord ;
- traite un UR à la fois : `closeOne(..., { allowConversation: false })` pour un radar,
  `closeStale` pour un abandonné.

Les deux rangs sont donc vérifiés dans `close.ts`, pas seulement par la visibilité du
bouton.

### 4.3 Confirmations

- **Un abandonné** : titre `#id`, faits « fermé comme non identifié », « aucun message
  envoyé », « signalé il y a N jours ». Pas d'avertissement : rien ne quitte la machine,
  la fermeture va dans la pile d'annulation.
- **Lot** : une ligne par famille présente, par exemple « 12 radars : message puis non
  identifié » et « 30 abandonnés : non identifié, sans message ». Les citations du message
  par langue n'apparaissent que si le lot contient des radars, et l'avertissement « le
  message part immédiatement » aussi.

### 4.4 Onglet

De haut en bas :

1. titre et note, bannière d'état (inchangés) ;
2. **bloc de cases** : Radars, Feux sur autoroute, Abandonnés (> 14 jours) ;
3. résultat du dernier traitement ;
4. bouton unique de lot ;
5. sections radars (« À traiter », « Conversation ») si la case radars est cochée ;
6. section feux si la case feux est cochée et qu'il y en a ;
7. section « Abandonnés (N) » si la case est cochée, chaque ligne avec son bouton
   « Fermer ».

Le bouton de lot compte les radars prêts si la case radars est cochée et que le niveau est
au moins 3, plus les abandonnés si leur case est cochée et que le niveau est au moins 4. Il
est caché si ce total est nul. Au-delà de 50, le libellé dit « 50 sur N », comme
aujourd'hui.

Une case décochée masque sa section et retire sa famille du lot. Décocher « Abandonnés »
arrête aussi la lecture des conversations au balayage suivant ; les verdicts déjà en cache
restent.

## 5. Erreurs

Rien de nouveau dans les cas : les mêmes raisons (`skipGone`, `skipConversation`,
`errDetails`, `errClose`, `errNotAllowed`) et le même résumé. Le rappel de sauvegarde
« messages déjà envoyés » n'apparaît que si au moins un radar a été fermé ; sinon c'est
`saveReminderNoMessage`.

`localStorage` indisponible : les cases fonctionnent pour la session et reviennent aux
défauts au rechargement.

## 6. Tests

Vitest, avec le `fake-sdk.ts` existant :

- `detect.test.ts` : seuil de 14 jours (juste en dessous, juste au-dessus), radar exclu,
  UR fermé ou non éditable exclu ; `hasDiscussion` avec aucun commentaire, seulement
  `Map_Team`, `Map_Team` + un autre, `userName` `null`.
- `settings.test.ts` : défauts, fusion d'un JSON partiel, JSON illisible, `localStorage`
  qui lève une exception.
- `scanner.test.ts` : conversations des candidats lues seulement case cochée ; feu sur
  autoroute jamais abandonné ; radar jamais abandonné ; candidat qui gagne un commentaire
  sort de la liste.
- `close.test.ts` : `closeStale` relit et saute un UR qui a gagné une discussion ; aucun
  `addComment` ; `closeMany` vide les abandonnés sous le niveau 4 et garde les radars au
  niveau 3 ; plafond partagé, radars d'abord.
- `flows.test.ts` / `confirm-spec.test.ts` : le lot mixte décrit les deux familles ; un lot
  d'abandonnés seuls n'a ni citation ni avertissement.
- `ui/format.test.ts` : visibilité et libellé du bouton selon les cases et le niveau.

## 7. À vérifier dans WME

- `<wz-checkbox>` : l'attribut `checked`, l'événement émis au clic, et le rendu en thème
  sombre. Sans événement exploitable, repli sur `<input type="checkbox">`.
- Que les commentaires automatiques portent bien `userName === "Map_Team"` (et pas
  `"map_team"` ou un identifiant) sur un UR réel.
- Le temps de lecture des conversations sur une zone dense (Zurich, Genève) avec la case
  « Abandonnés » cochée.

## 8. Documentation

- `CLAUDE.md`, section *Speed-camera URs* : le critère, `STALE_BATCH_MIN_RANK`, la règle de
  chevauchement, et le fait que les feux sur autoroute n'entrent jamais dans un lot, même
  par « abandonnés ».
- Les quatre README : entrée *Added* au changelog.

## 9. Hors périmètre

- Type d'UR affiché dans la ligne (douze libellés à traduire en quatre langues, pour un
  gain faible).
- Seuil de 14 jours réglable.
- Message au rapporteur d'un UR abandonné.
