# UR abandonnés : relance puis message de clôture

Date : 2026-10-18
Branche : `feat/stale-ur-reminder`
Périmètre : `src/speed-camera-urs/`, `locales/*/common.json`, les quatre README, `CLAUDE.md`

## 1. Pourquoi

Un UR abandonné est aujourd'hui fermé en Non identifié **sans un mot**. Le rapporteur, s'il
revient, trouve son signalement fermé sans explication, et n'a jamais eu de dernière chance
de répondre. La famille « abandonnés » passe donc à deux temps : un ultime rappel, puis,
faute de réponse, un message de clôture avant la fermeture.

## 2. Ce qui est décidé

| Question                | Décision                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrée dans la famille  | Inchangée : ouvert, éditable, tout type sauf radars et Map Mate, plus de 14 jours sans activité, le rapporteur n'a pas le dernier mot                                       |
| Premier temps           | **Relance** : un commentaire dans la langue du rapporteur, l'UR reste ouvert                                                                                                |
| Texte de la relance     | Dit que, sans information, le signalement sera fermé « très prochainement ». **Aucun délai chiffré** dans le texte                                                          |
| Délai interne           | `REMINDER_GRACE_DAYS = 3` jours après la relance, compté depuis la date de la relance dans la conversation                                                                  |
| Second temps            | **Clôture** : message « faute d'informations, ce signalement va être fermé », puis fermeture Non identifié                                                                  |
| Ordre d'écriture        | Comme les radars : le commentaire d'abord (irréversible), la fermeture seulement s'il est parti                                                                             |
| Réponse du rapporteur   | Après la relance, il a le dernier mot : l'UR sort de la liste, comme aujourd'hui                                                                                            |
| Avant les 3 jours       | Ligne « relancé · fermeture dans N j », sans bouton                                                                                                                         |
| Rangs                   | Un par un : tous niveaux. En lot : niveau 4 (`STALE_BATCH_MIN_RANK`), relances et clôtures                                                                                  |
| « Ne plus montrer »     | Retiré de la clôture qui envoie un message (règle : jamais sur un envoi). Gardé seulement quand le message de clôture est déjà dans la conversation (UR rouvert par Ctrl+Z) |
| Relance faite à la main | Une relance d'éditeur d'une autre formulation n'est pas reconnue : l'UR reçoit la nôtre 14 jours plus tard                                                                  |

## 3. Reconnaître nos messages

Le délai doit survivre à un rechargement et à un autre poste : il part de la **date du
commentaire de relance** dans la conversation, reconnu à son texte (`isStaleReminder`, les
quatre langues, espaces écrasés, comme `isOfficialMessage`). Le message de clôture est
reconnu de la même façon (`isStaleClosing`).

WME peut rendre la conversation qu'il a en mémoire, sans notre commentaire tout juste
envoyé. Deux traces de session complètent donc la conversation, dans `close.ts` :
`remindedAt(id)` (heure de la relance) et `wasMessaged(id)` (clôture envoyée). Sans elles, un
UR relancé reviendrait en « à relancer » au scan suivant.

Un commentaire sans auteur passe aujourd'hui pour le rapporteur. Notre texte, lui, ne l'est
jamais : un de nos messages qui reviendrait sans nom ne doit pas faire sortir l'UR.

## 4. Le verdict (`stale.ts`)

`staleStage(comments, reportedOn, now, session)` décide, dans cet ordre :

1. Le dernier commentaire d'une personne (Map_Team exclu) est du rapporteur et n'est pas
   notre texte → `none`.
2. Message de clôture déjà envoyé (conversation ou session) → `close`, `closingSent: true`.
3. Relance trouvée (dernier commentaire d'une personne, ou session sans commentaire plus
   récent) → `close` si 3 jours sont passés, sinon `waiting`.
4. Plus de 14 jours sans activité → `remind`, sinon `none`.

Nouveau module plutôt que `detect.ts` : le verdict a besoin des textes de `message.ts`, qui
importe déjà `detect.ts`.

## 5. Écriture (`close.ts`)

- `remindStale` : re-lit tout, exige `remind`, envoie la relance, note `remindedAt`.
  Résultat `"reminded"`, l'UR reste ouvert.
- `closeStale` : re-lit tout, exige `close`. Si la clôture n'est pas encore partie, l'envoie
  puis ferme ; sinon ferme seulement.
- `BatchRequest` gagne `staleRemind`. Plafond partagé, dans l'ordre : radars, Map Mate,
  clôtures, relances. Le lot ne prend que les clôtures dont le message reste à envoyer ;
  celles déjà envoyées se ferment une par une.

## 6. Écran

- Section « Abandonnés » : `à relancer` (bouton « Relancer »), `relancé · fermeture dans N j`
  (sans bouton), `relancé il y a N j` (bouton « Fermer avec message »).
- La confirmation cite le texte exact dans la langue du rapporteur, avec l'avertissement
  « le message part immédiatement ».
- La confirmation du lot liste relances et clôtures sur deux lignes, et cite chaque texte.

## 7. Tests

`stale.test.ts` (les quatre étapes, la session, l'auteur manquant), `close.test.ts`
(`remindStale`, `closeStale` avec message, ordre comment puis fermeture, échec d'envoi, lot),
`flows.test.ts` (confirmations, pas de « ne plus montrer » sur un envoi), `scanner.test.ts`,
`confirm-spec.test.ts`, `format.test.ts`, `message.test.ts`.
