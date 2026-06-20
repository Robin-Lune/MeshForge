# Frontend carte (Phase 3)

Carte temps réel des nodes du réseau Meshtastic 974, alimentée par l'API Next.js.

## Stack

- **MapLibre GL JS** (`maplibre-gl`, BSD-3) — rendu vectoriel WebGL. Composant client
  unique [`components/MapView.tsx`](../components/MapView.tsx) (`"use client"`).
- **Tuiles** : style OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`), sans
  clé. Données OpenStreetMap (ODbL) → attribution "© OpenStreetMap contributors" affichée.
  - **Avant la prod communautaire** : basculer sur un fichier `.pmtiles` (extrait Réunion)
    self-hosté via le protocole Protomaps (`pmtiles` + `protomaps-themes-base`). Objectif :
    zéro dépendance externe au runtime. Ne PAS utiliser les tuiles raster
    `tile.openstreetmap.org` en prod (interdit par leur usage policy).
- **Server Components par défaut** : [`app/page.tsx`](../app/page.tsx) (serveur) calcule les
  stats (`getStats()`) et rend la barre + `<MapView />`. Seul `MapView` est client.

## API

Toutes les routes sont des Route Handlers Next 16 (`app/api/<x>/route.ts`,
`export const dynamic = "force-dynamic"` → request-time, jamais prérendues car elles
interrogent la DB).

| Route          | Réponse                                                              |
| -------------- | ------------------------------------------------------------------- |
| `GET /api/nodes`  | `PublicNode[]` — nodes publics localisés (cf. privacy ci-dessous) |
| `GET /api/stats`  | `Stats` — `nodesTotal`, `nodesOnline` (15 min), `packets24h`, `lastPacketAt` |
| `GET /api/stream` | Flux **SSE** (`text/event-stream`) — événements `node_update`       |

Requêtes SQL centralisées dans [`lib/queries/`](../lib/queries) (jamais inline). Mapping
snake_case (DB) → camelCase (API) via alias SQL ; timestamps → ISO 8601 ; `COUNT(*)` bigint
→ `Number()`.

## Temps réel — SSE + Postgres LISTEN/NOTIFY

Le worker MQTT est un process séparé de Next.js. La synchro passe par la DB :

1. **Worker** : à chaque upsert d'un node *public*, `upsertNode` ([`lib/queries/nodes.ts`](../lib/queries/nodes.ts))
   fait `pg_notify('node_update', <payload JSON>)`. Le `RETURNING` de l'upsert donne l'état
   fusionné ; le notify ne part que si `isPubliclyVisible(row)`.
2. **Next.js** : [`lib/realtime.ts`](../lib/realtime.ts) tient **un seul** client `pg` en
   `LISTEN node_update` (singleton `globalThis`, comme `lib/db.ts`) et fan-out vers tous les
   abonnés via un `EventEmitter`. → 1 connexion DB pour les notifs quel que soit le nombre
   d'onglets. `parseNotification` valide le payload défensivement.
3. **Route SSE** [`app/api/stream/route.ts`](../app/api/stream/route.ts) : `subscribe()` →
   `event: node_update\ndata: {...}`. Heartbeat `: ping` ~25 s. Cleanup sur `request.signal`.
4. **Client** : `EventSource('/api/stream')`, `addEventListener('node_update', ...)` →
   crée/déplace le marker correspondant (Map `nodeId → Marker`).

Le LISTEN démarre au 1er abonné (lazy) ; en cas de coupure DB il se réarme au prochain
`subscribe`.

## Privacy (OBLIGATOIRE)

Règle centralisée dans [`lib/privacy.ts`](../lib/privacy.ts) `isPubliclyVisible` (testée) :
un node n'est visible que si `share_on_map = TRUE AND is_mobile = FALSE` ET localisé.

Appliquée à **deux** endroits qui doivent rester cohérents :
- **API REST** : filtre dans le `WHERE` SQL de `getPublicNodes` / `getStats`.
- **Temps réel** : le `pg_notify` ne part que pour les nodes publics (un node privé/mobile
  n'est jamais poussé en SSE, même fugacement).

Noms de nodes (issus du mesh, non fiables) injectés via `textContent` côté popup → pas d'XSS.

## Vérification manuelle

```
docker compose up -d        # TimescaleDB + Mosquitto
yarn worker:dev             # ingestion MQTT (+ pg_notify)
yarn dev                    # http://localhost:3000
```

Carte de La Réunion, markers des nodes publics, popup au clic, et un marker qui
apparaît/se déplace en direct à l'arrivée d'un paquet. Vérifier qu'un node `is_mobile=true`
ou `share_on_map=false` n'apparaît jamais (ni REST, ni SSE).

## Phase 4 (à venir)

Heatmap de couverture SNR : source GeoJSON + couche `heatmap` MapLibre (pas des markers HTML),
API `/api/coverage`.
