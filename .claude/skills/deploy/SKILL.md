---
name: deploy
description: Publier le userscript WME Switzerland Helper, sur le canal beta ou en version stable. À utiliser quand il est question de déployer, publier, sortir ou livrer une version, taguer une release, ou faire tester une beta.
---

# Déploiement

Deux canaux, deux workflows. Le CI fait tout le build : ne le refais pas à la main.

| Canal  | Workflow                        | Déclencheur     | Branche de sortie | URL d'installation                                                           |
| ------ | ------------------------------- | --------------- | ----------------- | ---------------------------------------------------------------------------- |
| stable | `.github/workflows/release.yml` | tag `vX.Y.Z`    | `releases`        | `.../Waze-Dev-CH/WME-Switzerland-Helper/releases/releases/main.user.js`      |
| beta   | `.github/workflows/beta.yml`    | push sur `beta` | `beta-releases`   | `.../Waze-Dev-CH/WME-Switzerland-Helper/beta-releases/releases/main.user.js` |

Les deux réécrivent `package.json` et `header.js` eux-mêmes, construisent, puis
force-pushent leur branche de sortie.

## Règle de sécurité

**Arrête-toi avant tout `git push` et tout `git tag`.** Affiche ce qui partira, attends un
accord explicite. Un tag poussé crée une Release publique et met à jour tous les éditeurs
qui ont le script installé : en pratique, ça ne se rattrape pas.

## Mode `beta`

Invocation : `/deploy beta` (depuis la branche à faire tester).

1. Arbre propre (`git status --short` vide) et `git fetch origin`.
2. `beta` existe ? Sinon la créer depuis `origin/main`. Sinon, la mettre à jour puis y
   merger la branche à tester.
3. **Arrêt.** Montre `git log --oneline origin/beta..HEAD` et demande l'accord.
4. `git push origin beta`, puis `gh run watch` (gh est installé et authentifié).
5. Vérifie le résultat publié :

   ```sh
   gh api repos/Waze-Dev-CH/WME-Switzerland-Helper/contents/releases/main.user.js \
     --ref beta-releases -q .content | base64 -d | head -8
   ```

   Attendu : `@version` à quatre segments (`1.4.1.57`) et `@updateURL` pointant sur
   `beta-releases`. Si `@updateURL` pointe encore sur `releases`, le `sed` du workflow a
   raté et les testeurs repasseront en stable à la prochaine mise à jour.

## Mode `release`

Invocation : `/deploy release [X.Y.Z]`.

1. Tout est mergé dans `main`, arbre propre, `git fetch origin`, `git switch main`.
2. Barrières locales, dans cet ordre :

   ```sh
   npm test
   npx eslint .
   npx rollup -c
   ```

3. Version : si elle n'est pas donnée en argument, propose-la d'après le contenu de la
   section non publiée du changelog (des entrées « Added » → version mineure, uniquement
   « Fixed » → patch) et fais-la valider.
4. Changelog dans les **quatre** READMEs. Le titre de section non publiée est traduit :

   | Fichier        | Titre à remplacer        |
   | -------------- | ------------------------ |
   | `README.md`    | `### [Unreleased]`       |
   | `README.fr.md` | `### [Non publié]`       |
   | `README.de.md` | `### [Unveröffentlicht]` |
   | `README.it.md` | `### [Non pubblicato]`   |

   Chacun devient `### [X.Y.Z] - AAAA-MM-JJ` (date du jour), et une section non publiée
   vide est rouverte au-dessus, avec son titre dans sa langue.

5. `git commit -am "docs: release X.Y.Z"`.
6. **Arrêt.** Récapitule : version, tag, fichiers touchés, commits qui partent. Demande
   l'accord.
7. `git tag vX.Y.Z && git push origin main vX.Y.Z`, puis `gh run watch`.
8. Vérifie : `gh release view vX.Y.Z`, et que le fichier publié porte bien la bonne
   version :

   ```sh
   gh api repos/Waze-Dev-CH/WME-Switzerland-Helper/contents/releases/main.user.js \
     --ref releases -q .content | base64 -d | grep '@version'
   ```

## Pièges vérifiés

| Piège                                                     | Ce qu'il faut savoir                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` est à `1.3.0`, le dernier tag est `v1.4.1` | Le CI réécrit la version depuis le tag. La valeur locale est morte : ne la corrige pas, ne t'y fie pas.                          |
| `npm run release` en local produit un fichier à `1.3.0`   | Il lit `package.json`. C'est normal, ce n'est pas ce qui est publié.                                                             |
| `CLAUDE.md` demande `npm run lint`                        | Ce script n'existe pas dans `package.json`. Utilise `npx eslint .`.                                                              |
| `npm run build` échoue en local                           | `rollup` n'est pas installé localement ; le CI fait `npm install --global rollup`. En local, `npx rollup -c` suffit à compiler.  |
| Le tag doit être exactement `vX.Y.Z`                      | `release.yml` filtre sur `v*.*.*`. Sans le `v`, ou avec un suffixe, rien ne se déclenche et rien ne le signale.                  |
| `releases` et `beta-releases` sont générées               | Force-pushées par le CI à chaque run. Toute modification manuelle est écrasée au run suivant.                                    |
| La beta garde le même `@name`/`@namespace` que la stable  | Elle **remplace** la stable dans Tampermonkey. C'est voulu : les `scriptId` sont codés en dur et deux copies actives se cassent. |

## Ne jamais faire

- Éditer `header.js` ou `package.json` pour changer la version : le CI le fait depuis le tag.
- Pousser à la main sur `releases` ou `beta-releases`.
- Publier une release en n'ayant mis à jour que `README.md` : les quatre langues, toujours.
