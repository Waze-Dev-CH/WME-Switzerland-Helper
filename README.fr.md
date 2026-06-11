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
  [Installer WME Switzerland Helper](https://raw.githubusercontent.com/73VW/WME-Switzerland-Helper/releases/releases/main.user.js)
- Votre navigateur affichera une page vous demandant si vous souhaitez installer le script. Cliquez sur le bouton <kbd>Install</kbd>.

3. **Commencez à éditer!**

- Ouvrez le [Waze Map Editor](https://www.waze.com/editor?tab=userscript_tab).
- Vous verrez de nouvelles options et une courte explication dans l'onglet `Scripts`.

_Et voilà ! Le script s'exécute automatiquement lorsque vous utilisez l'éditeur de cartes Waze._

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

---

## 💡 Besoin d'aide ? Vous avez des idées ?

Si vous avez des questions, si vous trouvez un bogue ou si vous voulez suggérer une nouvelle fonctionnalité :

1. Rendez-vous sur le [système de suivi des problèmes du projet](https://github.com/73VW/WME-Switzerland-Helper/issues/new).
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
