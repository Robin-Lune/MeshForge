# Architecture — MeshForge

Dashboard de monitoring du réseau Meshtastic de La Réunion (974). Télémétrie LoRa →
MQTT → TimescaleDB → carte temps réel + historique.

## Stack

| Couche        | Techno                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Frontend      | Next.js 16 (App Router, Server Components), React 19, Tailwind v4      |
| Carte         | MapLibre GL JS (tuiles OpenFreeMap → Protomaps self-host avant prod)   |
| API           | Route Handlers Next (`app/api/*`), SSE pour le temps réel             |
| Worker        | Process Node autonome (TS via `tsx`), client `mqtt`                    |
| Base          | TimescaleDB (Postgres + hypertables), accès via `pg`                  |
| Broker        | Mosquitto (uplink only, downlink OFF)                                  |
| Infra locale  | `docker compose up` (Mosquitto + TimescaleDB)                          |

TypeScript strict partout (worker + frontend). Tests : Vitest (logique pure, TDD).
CI (`.github/workflows/ci.yml`) : typecheck + lint + test.

## Flux de données

```
Nodes Meshtastic ──MQTT(JSON)──▶ Mosquitto ──▶ worker ──▶ TimescaleDB ──▶ API Next ──▶ carte
                                              (parse,        (packets,      (/api/nodes,    (MapView)
                                               filtre         nodes)         /api/stats,
                                               privacy)                      /api/stream SSE)
                                                  │                              ▲
                                                  └──── pg_notify ──▶ LISTEN ─────┘ (temps réel)
```

## Structure des fichiers

```
db/init.sql                  Schéma : hypertable packets, tables nodes + contributors
docker-compose.yml           Mosquitto + TimescaleDB
mosquitto/config/            Config broker (uplink only)

src/worker/
  mqtt-subscriber.ts         Entrée worker : connecte MQTT, route les messages
  parser.ts                  Normalise un message brut → ParsedPacket (défensif)
  env.ts                     Charge .env.local puis .env avant lib/db

lib/
  db.ts                      Pool pg singleton (worker + Next)
  privacy.ts                 isPubliclyVisible — règle privacy carte (testée)
  realtime.ts                Bus SSE : 1 client LISTEN partagé + parseNotification (testée)
  queries/
    packets.ts               insertPacket
    nodes.ts                 upsertNode (+ pg_notify public), getPublicNodes
    stats.ts                 getStats (agrégats dashboard)

app/
  page.tsx                   Server Component : stats + <MapView/>
  layout.tsx                 Layout racine, metadata
  api/nodes/route.ts         GET PublicNode[]
  api/stats/route.ts         GET Stats
  api/stream/route.ts        SSE node_update

components/
  MapView.tsx                Carte MapLibre (client) : markers + EventSource

types/index.ts               Types partagés (RawMeshtasticPacket, ParsedPacket,
                             PublicNode, NodeUpdate, Stats)
```

## Principes

- **SQL centralisé** dans `lib/queries/`, jamais inline dans les composants.
- **Server Components par défaut**, Client uniquement pour la carte / l'interactivité.
- **Worker séparé** de Next.js (jamais dans une API route).
- **Privacy by design** : règle unique (`lib/privacy.ts`) appliquée API REST *et* temps réel.
- **Paquets malformés** : try/catch silencieux (le mesh envoie du bruit).
- **Self-hostable** : `docker compose up`, zéro dépendance cloud propriétaire.

## Docs détaillées

Voir [.claude/CLAUDE.md](.claude/CLAUDE.md) (règles projet) et `docs/` :
[frontend-carte](docs/frontend-carte.md) (implémenté). Les autres docs (`schema-db`,
`pipeline-mqtt`, `analytics`, `alertes`, `reseau-meshtastic`, `privacy-rgpd`,
`deploiement`) sont à rédiger au fil des phases.
