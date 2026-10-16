# Popups harmonisés et « Ne plus montrer »

Date : 2026-10-16
Périmètre : `src/ui/`, `src/utils.ts`, `src/street-name-checker/`, `src/house-number-importer/`,
`src/speed-camera-urs/`, `src/publicTransportStopsLayer.ts`, `main.user.ts`,
`locales/*/common.json`, les quatre README, `CLAUDE.md`

## 1. Pourquoi

Le script affiche deux familles de popups qui ne se ressemblent pas :

- **`showWmeDialog`** (`src/utils.ts`) : un bloc de texte centré, sans titre, des boutons WME
  génériques, le bouton Confirmer **en premier et sélectionné** (un Entrée réflexe valide).
  Onze popups l'utilisent : le vérificateur de noms, l'importeur de numéros et les arrêts TP.
- **Le dialogue de l'assistant UR** (`src/speed-camera-urs/ui/dialog.ts`) : titre, puces des
  effets, citation, avertissement avec icône, Annuler à gauche et sélectionné, action
  principale colorée à droite, thème clair/sombre par les tokens.

Yann aime le second. Tous les popups doivent en prendre l'apparence **et** la structure.

Deuxième besoin : sur les confirmations d'actions simples, une case **« Ne plus montrer »**.

## 2. Ce qui est décidé (par Yann)

| Question | Décision |
| --- | --- |
| Apparence | Celle du dialogue de l'assistant UR, partout |
| Structure | Titre, puces des effets, note ou citation si besoin, avertissement avec icône, Annuler à gauche et sélectionné, action à droite. Les textes des anciens popups sont réécrits dans cette forme, dans les quatre langues |
| Case « Ne plus montrer » | Seulement sur les confirmations d'actions simples et annulables : importer un numéro, ignorer tout un groupe du vérificateur, supprimer un arrêt TP obsolète, fermer une UR **sans message** abandonnée ou déjà messagée |
| Jamais de case | Mauvaise rue (`WRONG_STREET`, verdict géométrique), feu sur autoroute (aucun lot à aucun niveau, le popup est la seule vérification humaine), tout ce qui envoie un message à un rapporteur (radar, Map Mate, lot), toute action de groupe (correction de groupe, import en masse, lot d'UR), les messages d'erreur et d'information |
| Niveau pour la case des UR | La case n'apparaît sur une fermeture d'UR qu'au niveau qui a droit au lot de cette famille : niveau 3 (`BATCH_MIN_RANK`) pour une UR déjà messagée, niveau 4 (`STALE_BATCH_MIN_RANK`) pour une abandonnée. Cachée en dessous, et vérifiée à nouveau dans `close.ts` |
| Conversation en cours | Un choix mémorisé est ignoré dès que le popup a une conversation à montrer (`previousComment`) : le popup réapparaît dans ce cas, et seulement dans ce cas |
| Mémorisation | Par type de popup, dans le navigateur |
| Réafficher | Un bouton « Réafficher les confirmations » dans chaque onglet, qui réaffiche celles de cet onglet ; un dans l'onglet principal pour celles des arrêts TP |
| Design | Validé sur maquettes (`.superpowers/brainstorm/…/dialogues-v1.html`) : voir § 4 |

## 3. Inventaire

Les identifiants de colonne « Case » sont ceux du store (§ 5.3). « Non » signifie toujours
affiché.

### Vérificateur de noms (`street-name-checker/fix.ts`)

| Appel | Clé i18n actuelle | Type | Case |
| --- | --- | --- | --- |
| `runFix`, verrou trop haut (un segment) | `confirmOverLockFix` | confirmation | Non (*choix de l'implémenteur, voir § 7*) |
| `runFix`, mauvaise rue | `confirmWrongStreetFix` + `noteMatchConfidence` | confirmation | Non |
| `runFix`, échec | `fixFailed` | erreur | Non |
| `runFixGroup`, niveau insuffisant | `errGroupFixRank` | erreur | Non |
| `runFixGroup`, verrou trop haut | `confirmOverLockFix` | confirmation de groupe | Non |
| `runFixGroup`, renommage | `confirmGroupFixDetailed` | confirmation de groupe | Non |
| `runFixGroup`, arrêt sur erreur | `fixStopped` | erreur | Non |
| `ignoreAll` | `confirmIgnoreAll` | confirmation | `chk.ignoreAll` |

### Importeur de numéros (`house-number-importer/import.ts`)

| Appel | Clé i18n actuelle | Type | Case |
| --- | --- | --- | --- |
| Import d'un numéro | `confirmSingleImport` | confirmation | Oui, voir § 5.4 |
| Import d'un numéro, échec | `describeFailure` | erreur | Non |
| Import en masse | `confirmMassImport*` | confirmation de groupe | Non |
| Import en masse, arrêt sur erreur | `importStopped` | erreur | Non |
| Import en masse, succès | `importedCount` | information | Non |

### Assistant UR (`speed-camera-urs/close.ts`, `confirm-spec.ts`)

| Spec | Effet | Case |
| --- | --- | --- |
| `closeOneSpec` | message + fermeture | Non |
| `closeOnlySpec` | fermeture d'une UR déjà messagée | `scu.closeOnly`, niveau 3 et plus |
| `closeTrafficLightSpec` | fermeture sans message | Non |
| `closeStaleSpec` | fermeture sans message | `scu.closeStale`, niveau 4 et plus |
| `askMapMateSpec` | message, l'UR reste ouverte | Non |
| `closeSelectedSpec` | lot | Non |
| `notify(...)` | erreurs et bilans | Non |

### Arrêts TP (`publicTransportStopsLayer.ts`)

| Appel | Clés i18n actuelles | Type | Case |
| --- | --- | --- | --- |
| `handleObsoleteVenueClick` | `deleteObsoleteStop.*` | confirmation de suppression | `pt.deleteObsolete` |
| Choix parmi plusieurs arrêts | `venueMatchDialog.selectMessage` | choix multiple | Non |
| `promptMergeAction` | `venueMatchDialog.message` (HTML brut) | choix multiple | Non |

## 4. Le rendu

Repris tel quel du dialogue de l'assistant UR (`scu-dialog`), avec deux ajouts validés sur
maquette :

- **Case « Ne plus montrer »** : à gauche de la rangée de boutons, texte en 11px `muted`.
  Décochée à chaque ouverture.
- **Bouton de danger** : rouge (`--*-error`), pour les suppressions. Le reste garde le bouton
  principal vert.
- **Popups à choix multiple** : une carte par choix, chaque carte porte le nom du choix en gras
  et une phrase d'explication en dessous. Annuler seul dans la rangée du bas. Les choix sont
  des boutons, cliquer dessus répond directement.

Inchangé : Annuler en premier et sélectionné à l'ouverture, Échap et clic hors du popup
annulent, le popup se retire du DOM une fois répondu, défilement interne au-delà de 86vh.

Les messages d'erreur et d'information prennent le même habillage : un titre, le texte, un
seul bouton OK.

## 5. Comment

### 5.1 Un composant partagé

Le dialogue de l'assistant UR déménage dans `src/ui/dialog.ts` et devient celui de tout le
script. Il garde :

- la description par données (`ConfirmSpec`), pour que les flux se testent sur ce qu'ils
  demandent ;
- l'hôte injectable (`DialogHost`) pour les tests sans page ;
- les citations multilingues avec drapeaux (l'assistant UR en a besoin, les autres n'en
  mettent pas).

`ConfirmSpec` gagne :

- `danger?: boolean` pour le bouton rouge ;
- `skip?: { label: string; isSkipped(): boolean; setSkipped(): void }` (forme exacte laissée à
  l'implémenteur). Quand `skip` est fourni et que `isSkipped()` est vrai, `showConfirm` répond
  `true` **sans rien afficher**. Si la case est cochée au moment de confirmer, il appelle
  `setSkipped()`. Annuler avec la case cochée ne mémorise rien.
- Quand le spec porte un `previousComment`, `showConfirm` affiche le popup même si
  `isSkipped()` est vrai. La règle vit dans le composant, pas chez chaque appelant, pour
  qu'un futur popup avec conversation en profite sans y penser.

Un `showChoice` pour les choix multiples prend un titre, des puces, une liste de
`{ value, label, description }` et un libellé Annuler, et résout la valeur choisie ou `null`.

`showNotice` prend un titre et un texte.

Les libellés (boutons, case) viennent toujours de l'appelant, jamais du composant : chaque
feature a sa propre instance i18next et sa propre préférence de langue
(voir les déviations de `CLAUDE.md`).

Les styles : le CSS du dialogue sort de `speed-camera-urs/ui/styles.ts` vers `src/ui/` sous
un préfixe propre au dialogue, avec `tokenRules` et `componentRules` comme les autres.
Le `z-index` 10000 est conservé (le vérificateur compte dessus, `street-name-checker/ui/styles.ts:44`).

### 5.2 Fin de `showWmeDialog`

`showWmeDialog` et son option `allowHtml` disparaissent. Le texte de fusion TP qui portait du
HTML (`<br/>`, `<pre>`) est réécrit en titre, puces et cartes. Plus aucun popup n'injecte de
HTML.

Les deux `prompt.ts` du vérificateur et de l'importeur passent de `(message: string)` à
`(spec: ConfirmSpec)`, comme celui de l'assistant UR. Les tests de flux lisent le spec reçu.

### 5.3 Le store « Ne plus montrer »

Un module partagé, une seule clé localStorage `wme-ch-helper.skipped-confirms`, une liste
d'identifiants préfixés par feature (`chk.`, `scu.`, `pt.`). Lecture et écriture dans un
try/catch : sans stockage, tout est affiché. Une valeur illisible vaut liste vide.

Réafficher les confirmations d'un onglet efface les identifiants de son préfixe.

### 5.4 Cas particulier : l'import d'un numéro

L'importeur a déjà un réglage `confirmSingleImport` (décoché par défaut) qui décide si l'import
d'un numéro demande confirmation. La case « Ne plus montrer » de ce popup **décoche ce
réglage** plutôt que d'écrire dans le store. Le réglage reste le seul endroit qui le
réactive ; le bouton « Réafficher » de l'onglet ne le touche pas.

### 5.5 Le niveau sur les fermetures d'UR

`closeOnlySpec` et `closeStaleSpec` ne reçoivent un `skip` que si l'éditeur a le niveau du lot
de leur famille (`BATCH_MIN_RANK`, `STALE_BATCH_MIN_RANK`). La décision se prend dans
`close.ts`, au moment de construire le spec, en relisant le rang : c'est à la fois ce qui
cache la case dans le popup et ce qui l'empêche de servir. Un choix mémorisé lors d'une
session de niveau plus élevé (compte partagé, niveau baissé) n'a donc aucun effet en
dessous : sans `skip`, le popup s'affiche.

### 5.6 Les boutons « Réafficher les confirmations »

| Onglet | Où | Efface |
| --- | --- | --- |
| Vérificateur | Réglages, à côté de « Réinitialiser » des signalements ignorés | `chk.*` |
| Assistant UR | Bas de l'onglet (il n'a pas de section réglages) | `scu.*` |
| Onglet principal | Sous les calques, près de la note des arrêts TP | `pt.*` |
| Importeur | Rien : le réglage existant suffit (§ 5.4) | |

Grisé quand rien n'est masqué pour cet onglet. Un clic efface, sans confirmation.

## 6. Ce qui ne change pas

- Aucun garde-fou de `CLAUDE.md` ne bouge : rangs, plafonds, re-lecture avant écriture, ordre
  commentaire puis fermeture.
- Une case cochée ne contourne **que** l'affichage. Toutes les vérifications faites avant ou
  après le popup (rang, préfixe, autoroute, déjà messagé, re-lecture) restent exécutées.
- Rien n'est enregistré automatiquement.

## 7. Laissé à l'implémenteur

- La forme exacte de `skip` dans le spec, et l'API du store.
- Le verrou trop haut sur **un** segment (`confirmOverLockFix` dans `runFix`) n'a pas de case :
  il annule un verrou souvent volontaire. *Choix de Claude, à contester à la relecture.*
- Les nouveaux textes, dans les quatre langues, en suivant le ton des specs de l'assistant UR
  (`confirm-spec.ts`) : le titre pose la question, les puces disent ce qui change. Pas de tiret
  cadratin.
- Le découpage en commits.

## 8. Documentation

- `CLAUDE.md` : la phrase de l'assistant UR qui justifie son propre modal devient la règle
  générale ; mentionner le store, la règle « jamais de case » sur les actions protégées, le
  niveau requis pour la case des UR et la règle de la conversation dans les règles de
  sécurité.
- README (les quatre) : entrée *Changed* (popups harmonisés) et *Added* (« Ne plus montrer »).

## 9. Tests

- Composant : rendu des éléments du spec, ordre et focus des boutons, Échap, clic hors popup,
  case cochée puis confirmée mémorise, case cochée puis annulée ne mémorise pas, identifiant
  mémorisé répond `true` sans monter de DOM, `showChoice` résout la valeur ou `null`.
- Store : stockage absent, valeur illisible, effacement par préfixe.
- Composant : choix mémorisé mais `previousComment` présent, le popup s'affiche.
- Flux : pour chaque popup protégé de § 3, le spec reçu n'a **pas** de `skip`. C'est le test
  qui empêche une case de réapparaître là où elle ne doit pas.
- Flux UR : sous le niveau du lot, `closeOnlySpec` et `closeStaleSpec` n'ont pas de `skip`,
  même avec un choix déjà mémorisé ; au niveau du lot, ils en ont un.
