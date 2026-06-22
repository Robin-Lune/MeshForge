<div align="center">

# 🛰️ MeshForge

**Dashboard open source de monitoring pour réseaux Meshtastic**

Carte de couverture temps réel + historique time-series pour le réseau LoRa de **La Réunion (974)**.

[![CI](https://github.com/Robin-Lune/meshforge/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PG16-fdb515?logo=postgresql)
![Self-hostable](https://img.shields.io/badge/self--hostable-docker_compose-2496ed?logo=docker)

</div>

---

## C'est quoi ?

Les nœuds Meshtastic (Heltec V4 & co) émettent leur télémétrie LoRa via MQTT. **MeshForge** ingère ce flux dans une base time-series et l'expose sur une carte interactive : qui couvre quoi, qui parle à qui, et comment le réseau évolue dans le temps.

Pensé pour le réseau réunionnais (compatible Gaulix : `EU_868`, profil `LONG_MODERATE`, hop limit 3), mais **self-hostable** pour n'importe quel mesh.

### Le différenciateur : la toile de liaisons

Là où les dashboards classiques affichent des points, MeshForge trace la **toile des liens radio depuis les gateways** :

- **Lien 0-hop plein** = portée radio **directe et réelle** (le gateway a entendu le node sans relais).
- **Lien mesh pointillé** = node atteint via relais.
- **Nœud-pont** (liseré bleu) = node entendu par ≥ 2 gateways → point de résilience du réseau.

C'est un outil de **diagnostic de portée et de résilience**, pas juste une jolie carte.

---

## ✨ Fonctionnalités

|     | Fonctionnalité                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------- |
| 🗺️  | **Carte temps réel** MapLibre GL — pastilles Meshtastic, clustering anti-superposition, MAJ live via SSE |
| 🕸️  | **Toile de liaisons** depuis les gateways (0-hop plein vs mesh pointillé, animée au survol)              |
| 🔍  | **Filtres** : recherche, rôle, fenêtre temporelle, nombre de hops                                        |
| 📈  | **Page détail node** : courbes 30 j (batterie, SNR…) + multi-SNR par gateway                             |
| 📊  | **Page statistiques** : répartitions et santé globale du réseau                                          |
| 🔒  | **Privacy by design** : public par défaut, mais consentement respecté à la source + droit de retrait     |

---

## 🏗️ Architecture

```
Nodes Meshtastic ──MQTT(JSON)──▶ Mosquitto ──▶ worker ──▶ TimescaleDB ──▶ API Next ──▶ carte
                                              (parse,        (packets,      (/api/nodes,    (MapView)
                                               filtre         nodes)         /api/stats,
                                               privacy)                      /api/stream SSE)
                                                  │                              ▲
                                                  └──── pg_notify ──▶ LISTEN ─────┘ (temps réel)
```

| Couche       | Techno                                                               |
| ------------ | -------------------------------------------------------------------- |
| Frontend     | Next.js 16 (App Router, Server Components), React 19, Tailwind v4    |
| Carte        | MapLibre GL JS (tuiles OpenFreeMap → Protomaps self-host avant prod) |
| API          | Route Handlers Next (`app/api/*`), SSE pour le temps réel            |
| Worker       | Process Node autonome (TS via `tsx`), client `mqtt`                  |
| Base         | TimescaleDB (Postgres 16 + hypertables), accès via `pg`              |
| Broker       | Mosquitto (**uplink only**, downlink OFF)                            |
| Infra locale | `docker compose up` (Mosquitto + TimescaleDB)                        |

**Principes de conception** : SQL centralisé dans `lib/queries/` (jamais inline) · Server Components par défaut · worker MQTT **séparé** de Next.js · barrière privacy unique (`lib/privacy.ts`) appliquée à l'API REST **et** au flux temps réel · paquets malformés en `try/catch` silencieux (le mesh envoie du bruit) · zéro dépendance cloud propriétaire.

Détails : [.claude/architecture.md](.claude/architecture.md).

---

## 🚀 Démarrage rapide

**Prérequis** : Node 20+, Yarn, Docker.

```bash
# 1. Cloner & installer
git clone https://github.com/Robin-Lune/meshforge.git
cd meshforge
yarn install

# 2. Configurer l'environnement
cp .env.example .env         # mot de passe DB (docker compose)
cp .env.example .env.local   # DATABASE_URL, MQTT_URL, canaux publics…

# 3. Lancer l'infra (TimescaleDB + Mosquitto)
docker compose up -d         # db/init.sql joué au 1er démarrage

# 4. Démarrer le worker MQTT (ingestion) — terminal dédié
yarn worker:dev

# 5. Démarrer le dashboard — autre terminal
yarn dev
```

Ouvrir **[http://localhost:3000](http://localhost:3000)**.

> Le worker et Next.js tournent **hors Docker** en dev. Docker ne porte que le broker et la base.

### Variables d'environnement (extrait)

| Variable               | Rôle                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Connexion TimescaleDB                                                                             |
| `MQTT_URL`             | Broker MQTT (uplink only)                                                                         |
| `MQTT_PUBLIC_CHANNELS` | **Allowlist** des canaux publics (default-deny). Tout canal absent est droppé **avant** insertion |

Modèle complet et commenté : [.env.example](.env.example).

---

## 🧰 Scripts

| Commande                    | Description                        |
| --------------------------- | ---------------------------------- |
| `yarn dev`                  | Serveur Next.js (dashboard)        |
| `yarn worker:dev`           | Worker MQTT en watch (ingestion)   |
| `yarn build` / `yarn start` | Build & run production             |
| `yarn test`                 | Tests Vitest (logique pure, TDD)   |
| `yarn typecheck`            | `tsc --noEmit` (TypeScript strict) |
| `yarn lint`                 | ESLint                             |

---

## 🔒 Privacy & RGPD

Politique : **public par défaut** (norme Meshtastic — un node qui uplinke est diffusé largement), **mais** consentement respecté à la source et droit de retrait.

- **`precision_bits`** du node honoré : on n'affiche jamais une position plus précise que ce que le node diffuse.
- **`ok_to_mqtt = false`** → node exclu de l'affichage.
- **Nodes mobiles** → position snappée sur une cellule **~500 m constante** (jamais re-randomisée : un flou aléatoire se moyennerait et révélerait le vrai point).
- **`Fr_EMCOM`** (urgence) + canaux privés/chiffrés → contenu et positions **jamais** exposés.
- **Opt-out + droit de suppression en un clic** ; NodeID anonymisable.

---

## 🤝 Contribuer

Workflow : branche `feat/…` · `fix/…` · `chore/…` · `refactor/…` → Pull Request vers `main` (branche protégée) → CI verte (typecheck + lint + test) avant merge.

La logique métier suit le cycle **TDD red-green-refactor** (Vitest). Les composants frontend en sont exemptés.

---

## 📄 Licence

MeshForge est distribué sous licence **AGPL-3.0**.

Vous pouvez l'héberger, le modifier et le partager librement, à condition
de publier vos modifications sous la même licence.

Pour un usage commercial en code fermé, une licence commerciale séparée
est disponible — contact : contact@la-forge-numerique.com

<div align="center">
<sub>Fait avec 💜 pour le mesh réunionnais 🇷🇪</sub>
</div>
