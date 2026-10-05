# Fermeture des UR « radar fixe »

Date : 2026-10-05
Branche : `feat/speed-camera-urs`
Périmètre : nouveau module `src/speed-camera-urs/`, `main.user.ts`, `locales/*/common.json`

## 1. Pourquoi

Des utilisateurs ouvrent des UR pour signaler des radars fixes. En Suisse, la loi interdit
de les afficher dans Waze, et chaque UR doit être fermé à la main avec une explication.
C'est un travail répétitif qui occupe les éditeurs.

Ces UR se reconnaissent au texte `MISSING_STATIC_SPEED_CAMERA` dans leur description.
L'outil liste ceux qui sont à l'écran, envoie à l'utilisateur la consigne officielle dans
sa langue et ferme l'UR.

## 2. Ce qui est décidé

| Question | Décision |
| --- | --- |
| État de fermeture | `not-identified` (rien n'est corrigé sur la carte, la demande est refusée) |
| Qui peut l'utiliser | UR par UR : tout le monde. Lot : niveau 3 minimum, bouton caché en dessous |
| UR avec un commentaire, quel qu'il soit | Exclus du lot, listés à part, traitables un par un (voir 4.1) |
| Message | Phrase sur les radars, puis consigne officielle mot pour mot, figé dans les locales |
| Langue du message | Celle de l'utilisateur (`userPreferences.language`) : fr, de, it, sinon en |
| Allemand | `ß` remplacé par `ss` (usage suisse) |
| Emplacement | Onglet à lui dans le groupe `CH ·`, nom provisoire « Radars » |
| Analyse | Automatique, sur les événements du modèle de données |
| Calque de mise en évidence | Non, la liste suffit pour une première version |

## 3. API utilisées

Toutes dans `sdk.DataModel.MapUpdateRequests` (`wme-sdk-typings`), aucune injection DOM :

| Besoin | API |
| --- | --- |
| UR chargés | `getAll()`, `getById()` |
| Conversation | `getUpdateRequestDetails({ mapUpdateRequestId })` → `comments[]` |
| Message | `addComment({ mapUpdateRequestId, text })` |
| Fermeture | `updateResolutionState({ mapUpdateRequestId, resolutionState: "not-identified" })` |
| Suivi | `wme-data-model-objects-added`, `-changed`, `-removed` sur `mapUpdateRequests` |
| Emprise | `sdk.Map.getMapExtent()` |
| Centrage | `sdk.Map.setMapCenter()` |

Le SDK n'offre aucun moyen d'ouvrir le panneau d'un UR. Cliquer sur un UR de la liste centre
la carte dessus, l'éditeur clique ensuite sur le marqueur.

## 4. Architecture

Nouveau module `src/speed-camera-urs/`, calqué sur l'importeur de numéros.

| Fichier | Rôle |
| --- | --- |
| `index.ts` | `initSpeedCameraUrs()`, appelé depuis `main.user.ts` après l'importeur. SDK et `scriptId` propres (`wme-ch-speed-camera-urs`), même raison que les deux autres modules : `registerScriptTab()` lève une erreur si le `scriptId` a déjà un onglet |
| `detect.ts` | Pur. `isSpeedCameraUr(ur)` : `isOpen`, `isEditable`, et `description` commence par `MISSING_STATIC_SPEED_CAMERA` |
| `classify.ts` | Pur. À partir des commentaires : `ready` ou `editorReplied` |
| `message.ts` | Pur. Choix de la langue et assemblage du texte |
| `close.ts` | Seul module qui écrit. `closeOne()`, `closeAll()`, `BATCH_MIN_RANK`, `BATCH_CAP` |
| `i18n.ts` | Instance i18next propre, comme les deux autres modules. Chaînes sous `speedCameraUrs` dans `locales/<lang>/common.json` |
| `prompt.ts` | Confirmations injectables au-dessus de `showWmeDialog`, pour tester sans DOM |
| `ui/tab.ts` | Onglet, construit avec `src/ui/components.ts`, rangé par `groupScriptTab` |

### 4.1 Analyse

1. Les événements du modèle de données sur `mapUpdateRequests` déclenchent une analyse,
   regroupée par un délai (debounce).
2. `getAll()`, filtré par `isSpeedCameraUr` et par l'emprise de la carte.
3. Pour ces UR seulement, `getUpdateRequestDetails`, appelés les uns après les autres. Un
   résultat déjà obtenu est gardé en mémoire tant que l'UR ne change pas.
4. `classify` répartit les UR entre les deux listes.

Règle retenue après le test préalable : **tout commentaire** envoie l'UR dans la liste
« Déjà une conversation », à traiter un par un. Aucun des 26 UR observés n'avait de
commentaire, donc on n'a pas pu voir comment `userName` distingue l'auteur d'un éditeur.
Plutôt que de deviner, on reste prudent : le cas courant (aucun commentaire) passe par le
lot, le reste est vu par un humain.

### 4.2 Fermeture d'un UR

1. `getUpdateRequestDetails` : relit la conversation. Le test préalable montre qu'`addComment`
   n'en a pas besoin, l'appel sert uniquement à la revérification de l'étape 2.
2. Revérification : toujours ouvert, toujours modifiable, toujours sans commentaire.
   Sinon, l'UR est sauté.
3. `addComment` avec le message dans la langue de l'utilisateur.
4. Seulement si l'envoi a réussi : `updateResolutionState("not-identified")`.

Le message part avant la fermeture : un échec d'envoi laisse l'UR ouvert et intact. L'ordre
inverse pourrait fermer un UR sans explication.

La fermeture va dans la pile d'édition, le message non. Si l'éditeur annule (undo), l'UR
redevient ouvert alors que le message est parti. Il réapparaît alors dans la liste « Déjà
une conversation », puisqu'il porte notre commentaire : la règle « tout commentaire bloque
le lot » empêche ainsi d'envoyer deux fois le message.

## 5. Message

Langue : `userPreferences.language` n'est **pas** un code ISO mais un identifiant de
langue de l'application Waze. Valeurs observées : `francais`, `eng`, `portuguese_pt`.
Règle : en minuscules, commence par `fr` donne fr, par `de` donne de (`deutsch`), par `it`
donne it (`italiano`), tout le reste (y compris `null`) donne en. Les identifiants exacts
pour l'allemand et l'italien n'ont pas été observés, d'où une règle par préfixe plutôt
qu'une table fermée.

Texte : phrase sur les radars, espace, consigne officielle.

**fr**
> Merci pour votre signalement. Les radars fixes ne peuvent pas être affichés dans Waze en
> Suisse et au Liechtenstein. Afin de respecter la réglementation locale, Waze a désactivé
> le signalement de la police pour les utilisateurs naviguant en Suisse et au
> Liechtenstein. Toutes les autres fonctionnalités de navigation, notamment les alertes de
> danger, les informations sur le trafic et les fermetures de routes, restent pleinement
> fonctionnelles.

**de**
> Danke für Ihre Meldung. Fest installierte Radare können in Waze in der Schweiz und in
> Liechtenstein nicht angezeigt werden. Um den lokalen Vorschriften zu entsprechen, hat
> Waze die Meldung von Polizeikontrollen für Nutzer deaktiviert, die in der Schweiz und in
> Liechtenstein navigieren. Alle anderen Navigationsfunktionen, einschliesslich
> Gefahrenmeldungen, Verkehrsinformationen und Strassensperrungen, bleiben weiterhin
> uneingeschränkt verfügbar.

**it**
> Grazie per la segnalazione. Gli autovelox fissi non possono essere visualizzati in Waze
> in Svizzera e Liechtenstein. Per conformarsi alle normative locali, Waze ha disattivato
> la segnalazione della polizia per gli utenti che navigano in Svizzera e Liechtenstein.
> Tutte le altre funzioni di navigazione, comprese le segnalazioni di pericoli, le
> informazioni sul traffico e le chiusure stradali, rimangono pienamente operative.

**en** (traduit de la version française)
> Thank you for your report. Fixed speed cameras cannot be shown in Waze in Switzerland
> and Liechtenstein. To comply with local regulations, Waze has disabled police reporting
> for users navigating in Switzerland and Liechtenstein. All other navigation features,
> including hazard alerts, traffic information and road closures, remain fully
> functional.

Ces textes sont des messages envoyés à des tiers, pas des libellés d'interface : ils
vivent dans les locales mais `message.ts` les demande explicitement dans la langue de
l'utilisateur (`t(key, { lng })`), quelle que soit la langue de l'interface.

## 6. Interface et sécurité

### 6.1 Onglet

- Nombre d'UR « radar » à l'écran.
- Liste « À traiter » : chaque UR avec sa langue, sa date et un bouton « Fermer avec
  message ». Cliquer sur la ligne centre la carte.
- Liste « Déjà une conversation » : même présentation, traitement un par un.
- Bouton « Tout traiter (N) » : caché sous le niveau 3, jamais grisé.
- Après un traitement : bilan et état par UR (traité, sauté, erreur avec sa raison).

### 6.2 Confirmations

Elles énoncent le changement, pas seulement le nombre.

- **Un UR** : « Envoyer ce message à l'utilisateur (langue : DE) et fermer l'UR en *Non
  identifié* ? Le message part immédiatement et ne peut pas être retiré. » Aperçu du texte
  exact envoyé.
- **Lot** : « 12 messages vont être envoyés maintenant (7 FR, 4 DE, 1 IT) et 12 UR fermés
  en *Non identifié*. Les messages ne peuvent pas être retirés. » Aperçu dans la langue de
  l'éditeur.

### 6.3 Garde-fous

- `BATCH_MIN_RANK` = rank 2 (niveau 3 affiché), dans `close.ts`. Bouton caché en dessous,
  et `closeAll()` refait la vérification. Un rang inconnu compte comme insuffisant.
- `BATCH_CAP` = 50, appliqué dans `closeAll()`, comme `IMPORT_CAP`. Au-delà, l'éditeur
  relance pour la suite.
- Revérification de chaque UR juste avant d'écrire (section 4.2).
- Traitement un UR à la fois, jamais en parallèle.
- Rien n'est jamais sauvegardé automatiquement.

### 6.4 Erreurs

- Échec de `getUpdateRequestDetails` ou de `addComment` : UR sauté, pas de fermeture,
  marqué en erreur. Le lot continue.
- Bilan : « 11 traités, 1 échec (UR #123 : raison) ».
- La fermeture passe par la pile d'édition (section 7), le bilan rappelle donc toujours :
  « Sauvegardez pour enregistrer les fermetures. Les messages sont déjà envoyés. »

## 7. Test préalable dans WME

À faire avant d'écrire le code. Les résultats sont reportés ici avant le plan.

**Étape 1, lecture seule.** Commande dans la console WME, sur une zone avec un UR radar :

- contenu brut de `description` (texte attendu présent tel quel, pas traduit) ;
- `updateRequestType` de ces UR ;
- `comments` et leurs `userName` (auteur de l'UR, éditeurs) ;
- `userPreferences.language`.

**Étape 2, écriture, sur un seul vrai UR radar** :

- `addComment` passe-t-il sans ouvrir le panneau, après `getUpdateRequestDetails` ?
- `updateResolutionState` va-t-il dans la pile d'édition (Sauvegarder actif) ou part-il
  tout de suite ?

Résultats :

| Point | Résultat |
| --- | --- |
| `description` | Toujours le préfixe `MISSING_STATIC_SPEED_CAMERA: ` suivi d'un texte libre, en langues et formulations variables (fr, en, pt) |
| `updateRequestType` | Toujours `INCORRECT_GENERAL_ERROR` : inutilisable pour filtrer |
| Volume | 26 UR radar sur 41 chargés dans la zone testée, 21 ouverts |
| `comments` | Vides sur les 26, y compris les 5 déjà fermés (fermés sans message) |
| `userName` | Non observé (aucun commentaire) |
| `language` | Identifiant Waze, pas ISO : `francais`, `eng`, `portuguese_pt` |
| `addComment` sans panneau | Passe directement, même sans `getUpdateRequestDetails` préalable ni panneau ouvert |
| `updateResolutionState` | Va dans la pile d'édition : `getUnsavedChangesCount()` passe de 0 à 1. Localement, `isOpen` devient `false` et `resolutionState` `not-identified` tout de suite |

## 8. Tests

Vitest, faux SDK comme dans les deux autres modules.

- `detect` : texte présent, absent, UR fermé, non modifiable, `description` nulle.
- `classify` : sans commentaire, avec commentaire.
- `message` : `francais`, `eng`, `portuguese_pt`, `deutsch`, `italiano`, `null`, texte complet.
- `close` : message avant fermeture, UR rouvert par undo (porte notre commentaire) exclu du lot, pas de fermeture si l'envoi échoue, refus sous le
  niveau 3 dans `closeAll`, limite à 50, UR traité entre-temps sauté, lot qui continue
  après un échec.

## 9. Documentation

- `CLAUDE.md` : section du module (pipeline, règles de sécurité), comme les deux autres.
- Changelog dans les quatre README.
- Nouvelles chaînes dans les quatre fichiers `locales/<lang>/common.json`.

## 10. Hors périmètre

- Calque de mise en évidence sur la carte.
- Message modifiable dans les réglages.
- Bouton dans le panneau de l'UR (injection DOM).
- Autres types d'UR à fermer en masse.
