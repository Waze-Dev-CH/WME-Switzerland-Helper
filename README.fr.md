# WME Switzerland Helper

Bienvenue à tous ! Cet outil est conçu pour rendre l'édition du Waze Map Editor (WME) plus facile et plus efficace pour tous ceux qui travaillent sur des cartes en Suisse - aucune connaissance technique n'est requise.

---

## 📚 Documentation dans votre langue

Choisissez votre langue préférée :

- 🇬🇧 [anglais](./README.md)
- 🇫🇷 [français](./README.fr.md)
- 🇮🇹 [Italien](./README.it.md)
- 🇩🇪 [Allemand](./README.de.md)

---

## 🚀 Qu'est-ce que ce script ?

**WME Switzerland Helper** est un module complémentaire gratuit pour l'éditeur de cartes Waze. Il ajoute de nouvelles fonctionnalités et des données cartographiques officielles suisses, ce qui facilite l'édition et l'amélioration des cartes en Suisse.

Vous n'avez pas besoin d'être un programmeur ou d'avoir des compétences techniques particulières pour l'utiliser !

---

## 🛠️ Comment installer et utiliser

1. **Installer Tampermonkey**
   Tampermonkey est une extension de navigateur gratuite qui vous permet d'ajouter des scripts utiles aux sites web.

- [Télécharger Tampermonkey pour Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Pour les autres navigateurs, recherchez "Tampermonkey" dans le magasin d'extensions de votre navigateur.

2. **Ajouter le script d'aide de WME Switzerland**

- Après avoir installé Tampermonkey, cliquez sur ce lien :  
  [Installer WME Switzerland Helper](https://raw.githubusercontent.com/Waze-Dev-CH/WME-Switzerland-Helper/releases/releases/main.user.js)
- Votre navigateur affichera une page vous demandant si vous souhaitez installer le script. Cliquez sur le bouton <kbd>Install</kbd>.

3. **Commencez à éditer!**

- Ouvrez le [Waze Map Editor](https://www.waze.com/editor?tab=userscript_tab).
- Vous verrez de nouvelles options et une courte explication dans l'onglet `Scripts`.

_Et voilà ! Le script s'exécute automatiquement lorsque vous utilisez l'éditeur de cartes Waze._

### Tester la version beta

Envie d'essayer ce qui arrive et de signaler les problèmes avant que tout le monde ne l'ait ?

- Installez plutôt depuis ce lien :  
  [Installer la version beta](https://raw.githubusercontent.com/Waze-Dev-CH/WME-Switzerland-Helper/beta-releases/releases/main.user.js)
- La beta s'installe sous son propre nom, **WME Switzerland Helper (Beta)**, à côté du script stable. Désactivez la version stable dans Tampermonkey avant de l'utiliser : deux copies actives en même temps se cassent mutuellement.
- Le numéro de version les distingue également : une beta en a quatre, `1.4.1.57`, là où la version stable en a trois, `1.4.1`.
- Pour revenir en arrière, recliquez sur le lien d'installation normal ci-dessus.

---

## 🌟 Caractéristiques

Avec ce script, vous obtenez :

- **Couches cartographiques officielles de la Suisse**
  Ajoutez et visualisez des couches de cartes supplémentaires directement dans WME, y compris :
  - Les limites des communes suisses (de swisstopo)
  - Limites cantonales suisses (de swisstopo)
  - Noms géographiques (swissNAMES3D)
  - Cartes nationales suisses en couleur
  - Images aériennes suisses à haute résolution
  - Arrêts de transports publics

- **Contrôle facile des couches**
  Activez ou désactivez chaque couche à l'aide de simples cases à cocher dans l'interface de WME.

- **Contrôle des noms de rue officiels**
  Compare le nom des segments que vous voyez avec le répertoire officiel suisse des rues (swisstopo) et met en évidence les écarts, avec correction en un clic. Un onglet dédié **CH · Nom des rues** liste les anomalies, groupées et distinguées par couleur, et le panneau d'édition du segment affiche le verdict pour le segment sélectionné.

Toutes les données cartographiques proviennent de sources officielles suisses (swisstopo), vous pouvez donc vous fier à leur exactitude.

### Fonctionnement de la couche des arrêts de transports publics

La couche **Arrêts de transports publics** affiche les arrêts de transport en commun officiels de la base de données des Chemins de fer fédéraux suisses (CFF). Voici ce que vous devez savoir :

- **Indicateurs visuels** : les arrêts à traiter apparaissent sous forme d'**icônes de bus orange** ; les lieux WME dont l'arrêt n'existe plus (retiré ou expiré dans les données CFF) apparaissent en **rouge** et peuvent être supprimés
- **Correspondance intelligente** : les arrêts déjà cartographiés par un lieu de même nom dans un rayon de **75 mètres** sont masqués ; seuls ceux nécessitant une action sont affichés
- **Regroupement** : aux faibles zooms (12–14), les arrêts proches sont regroupés en **clusters** ; cliquez sur un cluster pour zoomer sur sa zone
- **Bouton de rechargement** : un bouton avec une icône de bus dans la barre d'overlay recharge la couche sans bouger la carte, et tourne pendant le chargement
- **Cliquez pour agir** :
  - Orange → créer un nouveau lieu, ou fusionner avec / mettre à jour un lieu proche ; la ville de l'arrêt est renseignée automatiquement depuis sa localité
  - Rouge → supprimer le lieu obsolète
- **Types pris en charge** : bus, tramways, trains, bateaux, télécabines et funiculaires en Suisse

### Fonctionnement du contrôle des noms de rue

Le **contrôle des noms de rue** compare le nom de chaque segment avec le répertoire officiel suisse des rues et montre ce qui mérite votre attention :

- **Statuts distingués par couleur** : chaque anomalie est mise en évidence sur la carte et listée avec sa couleur, des simples différences de typographie ou d'orthographe aux cas plus sérieux, en passant par les abréviations et les fautes de frappe probables : un nom correct posé sur la **mauvaise rue** (signalé par ⚠️) ou un nom **introuvable** dans le répertoire. Chaque statut peut être activé ou désactivé.
- **Correction en un clic** : lorsque le nom officiel est connu, un bouton **Corriger** l'applique, segment par segment ou pour un groupe entier. **Rien n'est jamais enregistré automatiquement** : vos modifications rejoignent la pile d'édition habituelle de WME, à vous de les relire et de les enregistrer.
- **Prise en compte de la géométrie** : les axes officiels des rues sont mis en correspondance avec les segments, si bien qu'un segment sans nom reçoit une suggestion et qu'un nom placé sur la mauvaise rue est détecté.
- **Rues bilingues** : dans les communes bilingues, le nom officiel porte les deux langues (par exemple «Unterer Quai / Quai du Bas») ; le contrôle garde une langue comme nom principal et ajoute l'autre comme nom alternatif.
- **Ignorer les faux positifs** : un bouton **Ignorer** masque une anomalie dont vous savez qu'elle n'en est pas une ; elle reste masquée (l'information est conservée localement) et peut être réinitialisée depuis les réglages.
- **Lien vers le géoportail cantonal** : un bouton ouvre le segment sur la carte officielle du canton concerné, lorsqu'elle est disponible.

---

## 💡 Besoin d'aide ? Vous avez des idées ?

Si vous avez des questions, si vous trouvez un bogue ou si vous voulez suggérer une nouvelle fonctionnalité :

1. Rendez-vous sur le [système de suivi des problèmes du projet](https://github.com/Waze-Dev-CH/WME-Switzerland-Helper/issues/new).
2. Cliquez sur **"New issue "**.
3. Remplissez le titre et décrivez votre question, problème ou idée.  
   (Ne vous inquiétez pas si vous ne connaissez pas GitHub : vous devrez peut-être créer un compte gratuit)
4. Soumettez votre problème. Les responsables vous répondront dès que possible.

---

Merci de nous aider à améliorer Waze pour tout le monde en Suisse !

---

## 📝 Changelog

Tous les changements notables de ce projet sont documentés ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet adhère au [Versionnage Sémantique](https://semver.org/spec/v2.0.0.html).

### [Non publié]

### [1.5.0] - 2026-07-31

#### Ajouté

- **Les onglets du script disent enfin qu'ils vont ensemble.** La barre Scripts mélange les onglets de tous les userscripts installés, et rien n'indiquait que «Nom des rues» et «Numéros de maison» venaient de celui-ci. Les deux s'ouvrent désormais par le même marqueur court, **CH · Nom des rues** et **CH · Numéros de maison**, à côté de l'onglet principal **WME Suisse Helper**, et les trois se rapprochent les uns des autres dans la barre lorsque l'éditeur le permet. Si une future version de WME réorganise cette barre, ils restent simplement là où ils tombent, toujours marqués.
- **Importateur de numéros de maison suisses.** Un nouvel onglet 🏠 et une couche cartographique affichent directement sur la carte les points d'adresse officiels du registre fédéral des bâtiments et des logements (RegBL/GWR). Sélectionnez une rue et toutes les adresses que le registre connaît apparaissent : en vert les numéros encore manquants, en vert pâle ceux déjà cartographiés, en gris ceux appartenant à une autre rue. Cliquez sur un point vert et le numéro est créé aux coordonnées mêmes du registre, rattaché au segment que vous avez sélectionné. Quand toute une rue manque, un bouton les importe d'un coup, après une confirmation qui énumère exactement les numéros qui seront créés ; jusqu'à 50 par action, pour qu'une fausse manœuvre reste limitée. Rien n'est jamais enregistré à votre place : chaque numéro rejoint vos modifications en cours et <kbd>Ctrl</kbd>+<kbd>Z</kbd> l'annule. L'importateur connaît aussi les numéros déjà posés sur les segments voisins de la même rue, il ne propose donc pas de recréer celui que WME garde simplement sur le tronçon d'à côté ; il lit les deux noms des communes bilingues, si bien qu'un segment Zentralstrasse correspond à une adresse Rue Centrale ; et il laisse de côté les adresses des bâtiments seulement projetés ou encore en construction. <kbd>Alt</kbd>+<kbd>H</kbd> lance l'import en masse sans quitter la carte (remappable dans les réglages clavier de WME).

  L'idée n'est pas de nous : elle vient de [WME Quick HN Importer CH](https://greasyfork.org/en/scripts/551495-wme-quick-hn-importer-ch), d'**Ari (Reloaded)** et **Gerhard**, lui-même fondé sur le concept original de **Tom 'Glodenox' Puttemans** pour la Belgique. Le mérite d'avoir montré que les points d'adresse du registre ont leur place sur la carte leur revient. Il s'agit ici d'une implémentation neuve, écrite sur le SDK de WME, et non d'un portage de leur code.
- **Garde-fous sur les corrections en masse.** «Tout corriger» peut renommer jusqu'à 50 segments en un clic, et n'est désormais proposé qu'à partir du niveau 3 ; en dessous, le bouton n'apparaît pas et les segments se corrigent un par un. L'anomalie **mauvaise rue** reçoit partout plus d'égards : c'est le seul contrôle décidé purement par la géométrie, si bien qu'une erreur y remplace un nom parfaitement correct. Elle demande maintenant confirmation à chaque fois, même pour un seul segment, elle montre la solidité réelle de la correspondance (quelle portion du segment l'autre rue recouvre, et les distances en jeu), et elle démarre désactivée en dessous du niveau 3, où elle peut être activée depuis les réglages comme n'importe quelle autre catégorie. Les confirmations disent désormais ce que les noms deviennent, et pas seulement combien de segments sont touchés.
- **Panneau détachable** pour le contrôle des noms de rue : WME bascule la barre latérale sur son panneau de sélection dès que vous cliquez sur un segment, ce qui masquait la liste des anomalies précisément quand vous étiez en train de la traiter. Le panneau peut maintenant être détaché dans une fenêtre flottante qui reste visible, que vous pouvez déplacer et redimensionner. Sa position et sa taille sont mémorisées d'une session à l'autre, et la fenêtre est ramenée à l'écran si votre navigateur a rétréci entre-temps. Une fois détachée, la fenêtre porte la surface de travail (barre d'outils, état et liste des anomalies) et l'onglet garde les options, de sorte que les réglages restent là où vous les attendez. Réancrez-la depuis le bouton de la fenêtre ou depuis l'onglet, ou basculez avec <kbd>Alt</kbd>+<kbd>W</kbd> (remappable dans les réglages clavier de WME). L'onglet reste le mode par défaut : rien ne change tant que vous ne le demandez pas.
- Bouton **Analyser cette zone** : les vues trop grandes pour l'analyse automatique (au-delà de 6 km²) peuvent désormais être analysées à la demande, jusqu'à 50 km². Le balayage récupère le répertoire officiel par lots, verse les résultats partiels dans la liste au fur et à mesure, affiche la progression par tuiles dans la bannière d'état et peut être interrompu à tout moment (les résultats partiels sont conservés). Déplacer la carte n'interrompt pas un balayage en cours.
- Avertissements sur la qualité des données sous la bannière d'état : les zones denses tronquées par l'API du répertoire (cause possible de faux «introuvable»), les zones qui n'ont pas pu être chargées et un budget de recherche nationale épuisé sont désormais signalés au lieu d'être consignés en silence.

#### Corrigé

- Une seule requête échouée au répertoire n'interrompt plus toute l'analyse : la zone concernée est ignorée (ses segments restent non contrôlés plutôt que signalés à tort) et réessayée à l'analyse suivante.
- `npm run makemessages` ne déverse plus de clés vides, issues de l'espace de noms du contrôleur, dans chaque catalogue de traduction.

#### Modifié

- Accessibilité au clavier et aux lecteurs d'écran : les en-têtes de groupe et les lignes d'anomalie sont de vrais boutons (Entrée et Espace fonctionnent), les commandes réduites à une icône portent un libellé, les filtres exposent leur état enfoncé, et chaque commande affiche un contour de focus visible.
- Les pastilles de groupe affichent désormais le code du statut à côté de la pastille de couleur : un statut n'est plus transmis par la seule couleur.
- Cibles de clic agrandies sur les icônes de ligne ; les deux liens vers des visionneuses externes (map.geo.admin.ch et carte cantonale) sont regroupés dans un même encadré.
- Déplier un groupe ne déplace plus la carte ; un bouton ⌖ dédié dans l'en-tête du groupe zoome sur l'ensemble de ses segments.
- L'option «Afficher uniquement les segments visibles sur la carte» est aussi disponible à côté des interrupteurs principaux (elle reste également dans les réglages).
- La liste des anomalies adapte sa hauteur à la fenêtre au lieu d'un plafond fixe de 48 %, ce qui garde la légende et les réglages à portée.
- Les couleurs d'avertissement, de correction et d'ignorance suivent désormais le thème sombre de l'éditeur, et un changement d'habillage de WME est pris en compte sans recharger la page.

### [1.4.0] - 2026-06-16

#### Ajouté

- 🛣️ Contrôle des noms de rue officiels : compare les noms des segments Waze avec le répertoire suisse des rues (swisstopo / `api3.geo.admin.ch`), avec un onglet dédié **CH · Nom des rues** et un encart de verdict dans le panneau d'édition. Comprend des statuts distingués par couleur (typographie, abréviation ou variante, faute de frappe probable, mauvaise rue ⚠️, mauvaise localité, introuvable, sans nom, bilingue, contrôles des règles suisses et des verrous), la mise en correspondance géométrique, la correction en un clic (jamais enregistrée automatiquement), la gestion des noms alternatifs bilingues, une action Ignorer pour les faux positifs et un lien vers le géoportail cantonal. Fusionné depuis le userscript autonome `WME-CH-Street-Name-Checker` : son historique détaillé 1.0 à 1.18 est conservé dans [`docs/street-name-checker-changelog.md`](./docs/street-name-checker-changelog.md).
- Bouton **Tout ignorer** par groupe, pour écarter d'un coup un groupe entier de faux positifs (avec une confirmation pour les grands groupes)
- Contrôle du verrou des giratoires : les giratoires sont désormais attendus verrouillés au moins en **L3**

#### Corrigé

- Régler la langue du contrôleur ne change plus la langue du reste du script (par exemple les dialogues des transports publics)
- Moins de faux signalements **mauvaise rue** : un nom correspondant à une entrée du répertoire sans axe cartographié (par exemple un lieu-dit nommé) n'est plus signalé, et un nom qui n'est qu'une portion du libellé officiel (par exemple «Bach» dans «Bachweg») est désormais traité correctement
- Les noms fréquents («Route de Berne») ne signalent plus à tort **introuvable** lorsque l'axe correspondant appartient à une commune voisine : la recherche au répertoire parcourt maintenant toutes les pages de résultats
- Les continuations ne restent plus bloquées en faux **introuvable** après une mise en pause de l'analyse suivie d'une modification
- Les faux positifs écartés (Ignorer) sont conservés au travers des changements de format des réglages au lieu d'être réinitialisés en silence
- Aucun lien vers la carte cantonale n'est affiché pour un segment sans géométrie (il pointait auparavant hors de Suisse)

#### Modifié

- Recontrôle plus rapide pendant l'édition : les recherches de noms et les adresses sont mises en cache, seules les mises en évidence modifiées sont redessinées, et le déplacement de la carte est temporisé
- Style des boutons : les boutons Corriger sont verts et les boutons Ignorer d'un gris neutre, pour éviter les fausses manœuvres ; les longs noms dans les en-têtes de groupe passent à la ligne au lieu d'être coupés caractère par caractère
- Le lien vers la carte cantonale vaudoise ouvre désormais la nouvelle visionneuse `geoportail.vd.ch` avec le fond hybride et le thème mobilité (arrondissements, hiérarchie du réseau routier cantonal, lignes ferroviaires, traversées de localité) ; les liens cantonaux s'ouvrent maintenant à un zoom plus rapproché de 1:2000

### [1.3.0] - 2026-06-11

#### Ajouté

- 🔴 Détection des arrêts obsolètes : les lieux de transport WME ne correspondant plus à un arrêt CFF actif sont affichés en rouge et peuvent être supprimés
- 🟠 Regroupement aux zooms 12–14 : les arrêts proches sont regroupés en clusters cliquables qui zooment sur leur zone
- 🔄 Bouton de rechargement (icône de bus) dans la barre d'overlay, qui recharge la couche sans bouger la carte et tourne pendant le chargement
- 🏙️ Attribution automatique de la ville à la création/mise à jour d'un lieu, déduite de la localité de l'arrêt (avec repli sur le suffixe de canton)
- ⚡ Rendu progressif par tuiles avec cache du viewport (réutilise les données lors d'un zoom avant / déplacement interne, recharge sinon)
- ✅ Tests unitaires (Vitest) pour le nettoyage des noms, la correspondance des villes et la validité des arrêts

#### Modifié

- Les lieux sont récupérés directement depuis l'API Waze Features (`venueLevel=4`) en parallèle des données CFF, corrigeant les arrêts de bus/train manquants sous le zoom 17 ; les requêtes sont découpées par cellule de grille pour contourner le plafond de l'API
- Normalisation des noms d'arrêts réécrite et testée : retire le préfixe de localité (exact/abrégé/tronqué), les parenthèses de transport finales et les marques ferroviaires (CFF/SBB/FFS), déplie les abréviations courantes (Ptes→Petites, Rte→Route, Bif.→Bifurcation…) et conserve un suffixe de canton à 2 lettres
- Les arrêts sont filtrés par validité : seuls les arrêts actifs (`validto` ≥ aujourd'hui) sont proposés à l'ajout/mise à jour
- La fusion ne vise qu'un seul lieu choisi ; un lieu au même point (≤2,5 m) ne propose que « fusionner » ; plusieurs correspondances ouvrent une sélection
- Zoom minimal abaissé à 12 et zoom d'édition de lieu à 16
- Les arrêts CABLE_RAILWAY sont nommés « station de funiculaire »

#### Corrigé

- Déplacement/zoom de la carte temporisé (700 ms) pour éviter les requêtes redondantes
- Une sélection de lieu échouée (ex. un port hors écran) n'interrompt plus le gestionnaire de clic
- Cliquer sur un arrêt sous le zoom 16 ne casse plus la case à cocher de la couche

### [1.2.4] - 2026-01-14

#### Modifié

- Refonte de la barre latérale pour utiliser des classes TypeScript pour tous les composants UI (SidebarTab, SidebarSection, SidebarItem, Paragraph, TextContent)

### [1.2.3] - 2025-12-12

#### Modifié

- Refactorisé l'architecture de la couche de features : supprimé l'héritage triple, `SBBDataLayer` est maintenant une classe utilitaire (composition plutôt qu'héritage)
- Optimisé les perfs : approche basée sur le delta (dessiner seulement les nouvelles features, supprimer les obsolètes en batch)
- Amélioré l'efficacité du filtrage : les lieux sont récupérés une seule fois par passage de rendu au lieu d'appels SDK par enregistrement
- Ajout utilitaire `waitForMapIdle()` pour attendre proprement les données de la carte après les zooms
- Corrigé le flux zoom-vers-17 : attend maintenant que les lieux soient disponibles avant de re-filtrer les features

#### Corrigé

- Les arrêts de transport public n'affichent plus les doublons après avoir zoomé de < 17 à 17

### [1.2.2] - 2025-12-11

#### Corrigé

- Correction du chargement de tous les arrêts de transport public lors du rechargement du script quand la case était précochée. L'état de la couche est maintenant restauré après l'événement `wme-ready` pour s'assurer que les données des lieux sont disponibles avant de filtrer les arrêts en double.

### [1.2.1] - 2025-12-10

#### Modifié

- 💾 L'état des cases des couches est conservé entre les rechargements
- ⚡ Rendu plus rapide : seules les nouveautés/suppressions sont appliquées

### [1.2.0]

#### Ajouté

- 🚏 Couche Arrêts de transport public avec gestion du clic

### [1.1.0]

#### Ajouté

- 🗺️ Ajout de l'overlay swissNAMES3D

### [1.0.0]

#### Ajouté

- 🎉 Première version avec limites communales/cantonales et fonds nationaux

---

## Copyright

Ce projet est basé sur l'excellent travail de Francesco Bedini, qui a créé un modèle pour développer des scripts utilisateurs WME en Typescript. Vous pouvez trouver le projet original [ici](https://github.com/bedo2991/wme-typescript).

Son code est sous licence MIT, disponible [ici](./LICENSE.original) au moment de la création de ce fork.

Tout le code relatif au devcontainer Docker, aux paramètres VS Code, à l'utilisation des locales et au regroupement de paquets ("Tools") est également sous licence MIT.

Tout le code dans `/src/` (et tout fichier avec un copyright mentionnant Maël Pedretti) est sous licence [GNU Affero General Public License v3.0 or later (AGPL)](./LICENSE).

**Résumé:**

- L'utilisation du code original reste sous la licence MIT.
- L'utilisation du code que j'ai ajouté est restreinte par la licence AGPL telle que décrite dans la `LICENSE`.

Ce projet est donc **à double licence** : des parties sous MIT (original et outils), des parties sous AGPL (tout le code `/src/` et le nouveau travail de Maël Pedretti).
