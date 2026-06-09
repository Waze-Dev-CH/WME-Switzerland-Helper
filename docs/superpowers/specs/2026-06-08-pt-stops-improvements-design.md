# PT Stops Layer — Améliorations (Design Spec)

**Date:** 2026-06-08
**Scope:** `PublicTransportStopsLayer` et modules associés

---

## Contexte

Le layer de transports publics affiche les arrêts SBB (source: data.sbb.ch) qui n'ont pas encore de correspondance dans WME. Ce spec couvre 4 améliorations :

1. **Bug fix** — Arrêts à l'intérieur d'un polygon WME s'affichaient quand même (déjà corrigé dans commit `a0b15e0`, pas encore releasé)
2. **Arrêts obsolètes** — Venues WME de catégorie transport sans correspondance SBB → affichées en rouge, click → suppression
3. **Fetch Waze parallèle** — Charger les venues WME depuis l'API directement (venueLevel=4) en parallèle du fetch SBB, indépendamment de ce que le SDK a chargé (corrige aussi le bug sous zoom 17)
4. **Clustering** — À zoom 13–14, regrouper les stops en clusters cliquables ; minZoomLevel abaissé à 13

---

## Architecture — Nouveaux modules

### `src/wazeVenueFetcher.ts`

Responsabilité : appeler l'API WME Features directement pour obtenir les venues de transport dans le bbox courant.

```typescript
class WazeVenueFetcher {
  async fetchVenues(args: { wmeSDK: WmeSDK }): Promise<VenueLike[]>;
}
```

- Dérive le base URL depuis `window.location` : `origin + '/' + pathname.split('/')[1]`
  → ex: `https://beta.waze.com/row-Descartes`
- Appelle `{base}/app/Features?bbox={lon1},{lat1},{lon2},{lat2}&venueLevel=4&venueFilter=1,1,1,0`
- Utilise `GM.xmlHttpRequest` (cookies partagés avec la session WME)
- Filtre `response.venues.objects` pour ne garder que les venues de catégories transport :
  `BUS_STATION`, `TRAIN_STATION`, `SUBWAY_STATION`, `SEAPORT_MARINA_HARBOR`, `TRANSPORTATION`
- Retourne `VenueLike[]` (même interface que `wmeSDK.DataModel.Venues.getAll()`)
- Le header.js devra avoir `@connect beta.waze.com` (à vérifier/ajouter)

### `src/clusterManager.ts`

Responsabilité : regrouper une liste de positions en clusters selon le niveau de zoom.

```typescript
interface Cluster {
  id: string; // hash déterministe des IDs des éléments
  center: { lat: number; lon: number };
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  count: number;
  kind: "sbb-stop" | "obsolete-venue";
  itemIds: string[];
}

class ClusterManager {
  cluster(args: {
    items: Array<{
      id: string;
      lat: number;
      lon: number;
      kind: "sbb-stop" | "obsolete-venue";
    }>;
    zoomLevel: number;
  }): { clusters: Cluster[]; singles: typeof args.items };
}
```

**Algorithme greedy distance-based :**

1. Trier les items par latitude
2. Pour chaque item non-assigné, créer un cluster et y ajouter tous les items dans rayon `R(zoom)` :
   - Zoom 13 → R = 2000m
   - Zoom 14 → R = 800m
3. Cluster de count = 1 → retourné dans `singles` (affiché comme stop individuel)

---

## Modifications de `PublicTransportStopsLayer`

### Nouveau champ interne

```typescript
private featureKinds: Map<string, "sbb-stop" | "obsolete-venue" | "cluster-sbb" | "cluster-obsolete">
```

Utilisé par `styleContext` pour le rendu dynamique.

### `render()` override — fetch parallèle + deux phases

`PublicTransportStopsLayer` override complètement `render()`. `getFilterContext` n'est plus utilisé pour ce layer car on a besoin des records SBB ET des venues WME simultanément pour la phase obsolètes — or `getFilterContext` est appelé dans `FeatureLayer.render()` après `fetchData`, sans accès aux records déjà collectés.

```typescript
override async render(args: { wmeSDK: WmeSDK }) {
  const [sbbStops, wazeVenues] = await Promise.all([
    collectAll(this.dataFetcher.fetchRecords({ wmeSDK })),
    this.wazeVenueFetcher.fetchVenues({ wmeSDK }),
  ]);
  // Phase 1 : stops SBB sans match WME → orange
  // Phase 2 : venues WME sans match SBB → rouge
  // Clustering si zoom < 15
}
```

Les `wazeVenues` remplacent `wmeSDK.DataModel.Venues.getAll()` pour la correspondance. Cela corrige également le filtrage à zoom < 17 (venueLevel=3 ne charge pas les BUS_STATION dans le SDK).

**Zoom ≥ 15 (stops individuels) :**

Phase 1 — Stops SBB :

- Pour chaque stop SBB : `hasExactMatch(wazeVenues)` → si pas de match → feature orange

Phase 2 — Venues obsolètes :

- Pour chaque venue WME transport : `findMatchingSBBStop(sbbStops)` en utilisant `VenueMatcher.findMatchingVenues` inversé → si pas de match → feature rouge

**Zoom 13–14 (clustering) :**

- Même filtrage que zoom ≥ 15, mais les résultats passent dans `ClusterManager`
- Les clusters (count ≥ 2) → features cluster orange ou rouge
- Les singles (count = 1) → features individuelles orange ou rouge

### Style dynamique

```typescript
styleContext: {
  attributes: {
    kind: (featureId) => this.featureKinds.get(featureId) ?? "sbb-stop",
    label: (featureId) => {
      const cluster = this.clusterData.get(featureId);
      return cluster ? String(cluster.count) : "";
    }
  }
}

styleRules: [
  { filter: "[kind] = 'sbb-stop'",         style: { /* icône orange actuelle, pointRadius: 13 */ } },
  { filter: "[kind] = 'obsolete-venue'",   style: { /* même SVG, fond #e74c3c (rouge) */ } },
  { filter: "[kind] = 'cluster-sbb'",      style: { /* cercle orange large, label count */ } },
  { filter: "[kind] = 'cluster-obsolete'", style: { /* cercle rouge large, label count */ } },
]
```

Si `styleContext` avec attributs dynamiques n'est pas supporté par le SDK, fallback : générer des SVG base64 dynamiquement par count (5 buckets: 2–5, 6–10, 11–25, 26–50, 50+).

### `minZoomLevel` → 13

Abaissé de 14 à 13. La logique de zoom détermine l'affichage :

- zoom ≥ 15 → stops individuels
- zoom 13–14 → clusters
- zoom < 13 → rien (garder un seuil bas pour performance)

### Click handlers

| Feature cliquée   | Comportement                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Orange individuel | Inchangé (dialog merge/create existant)                                                    |
| Rouge individuel  | Dialog confirmation → `wmeSDK.DataModel.Venues.deleteVenue({ venueId })` → `removeFeature` |
| Cluster orange    | `wmeSDK.Map.setMapExtent({ extent: [bbox avec padding 0.001°] })`                          |
| Cluster rouge     | Idem — zoom sur bbox                                                                       |

Le zoom cluster cible le bbox du cluster (pas de zoomLevel fixe — le SDK calcule le zoom adapté à l'extent).

---

## Fichiers à créer / modifier

| Fichier                            | Action                                    |
| ---------------------------------- | ----------------------------------------- |
| `src/wazeVenueFetcher.ts`          | Créer                                     |
| `src/clusterManager.ts`            | Créer                                     |
| `src/publicTransportStopsLayer.ts` | Modifier (majeur)                         |
| `src/featureLayer.ts`              | Aucune modification nécessaire            |
| `header.js`                        | Vérifier/ajouter `@connect beta.waze.com` |
| `locales/*/common.json`            | Ajouter clés i18n pour dialog suppression |

---

## Points à vérifier pendant l'implémentation

1. **`styleContext` attributs dynamiques** : vérifier dans `node_modules/wme-sdk-typings/index.d.ts` que la signature supporte des fonctions par featureId. Si non, utiliser des SVG dynamiques.
2. **`wmeSDK.Map.setMapExtent`** : vérifier que cette méthode existe dans les typings (alternative : `setMapCenter` + `setZoomLevel`).
3. **`@connect` header.js** : vérifier si `beta.waze.com` est déjà listé.
4. **`wmeSDK.DataModel.Venues.deleteVenue`** : vérifier que la méthode existe et sa signature exacte.
5. **Format bbox Waze API** : `lon1,lat1,lon2,lat2` (confirmé via les URL exemples fournis).

---

## Non-inclus dans ce spec

- Feature 1 (bug polygon) : déjà corrigé dans `a0b15e0`, sera inclus dans le prochain release
- Changements de UI sidebar spécifiques aux nouvelles features
- Traduction des messages en 4 langues (géré lors de l'implémentation)
