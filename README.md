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

Fonctionnalités principales :

- Carte temps réel MapLibre GL avec clustering, filtres et SSE.
- Toile de liaisons depuis les gateways : 0-hop = portée radio directe ; mesh pointillé = via relais.
- Détail node : historique 30 j, SNR par gateway, distance, télémétrie.
- Admin : trames brutes, config runtime, RGPD, inscription relais MQTT.
- Privacy : public par défaut, mais précision du node respectée + droit de retrait.

---

## 🏗️ Architecture

```
Nodes Meshtastic ──MQTT(JSON/protobuf)──▶ Mosquitto ──▶ worker ──▶ TimescaleDB ──▶ API Next ──▶ carte
                                                    (parse,        (packets,      (/api/nodes,    (MapView)
                                                     filtre         nodes)         /api/stats,
                                                     privacy)                      /api/stream SSE)
                                                        │                              ▲
                                                        └──── pg_notify ──▶ LISTEN ─────┘ (temps réel)
```

Stack : Next.js 16, React 19, Tailwind v4, MapLibre GL, worker Node/TS, MQTT, TimescaleDB/Postgres 16, Mosquitto.

Principes : worker séparé de Next.js, SQL centralisé dans `lib/queries/`, broker **uplink only**, zéro dépendance cloud propriétaire.

Le worker ingère les topics Meshtastic `msh/+/+/json/#`, `msh/+/+/map/#` et
`msh/+/+/e/#`. Les paquets `/e/` chiffrés sont décodés uniquement quand la PSK
du canal est fournie via `MESHTASTIC_CHANNEL_KEYS`.

---

## 🚀 Développement local

**Prérequis** : Node 20+, Yarn, Docker.

```bash
git clone https://github.com/Robin-Lune/meshforge.git
cd meshforge
yarn install
```

### 1. Configurer l'environnement

```bash
cp .env.example .env
```

À minima, garder cohérents :

```env
DB_PASSWORD=...
DATABASE_URL=postgresql://meshforge:...@localhost:5432/meshforge
ADMIN_SESSION_SECRET=...
MESHTASTIC_CHANNEL_KEYS=Fr_Balise:AQ==
```

Si le mot de passe contient des caractères spéciaux, encode-le dans
`DATABASE_URL`, ou utilise les variables `PG*` documentées dans `.env.example`.
Laisse `MESHTASTIC_CHANNEL_KEYS` vide si tes gateways publient déjà du JSON et
que tu veux éviter les doublons fonctionnels en local.

### 2. Lancer l'infra dev

```bash
docker compose up -d
```

Lance TimescaleDB + Mosquitto. `db/init.sql` est joué au premier démarrage du
volume.

### 3. Lancer les process applicatifs

Terminal 1 :

```bash
yarn worker:dev
```

Terminal 2 :

```bash
yarn dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

### Debug dev

```bash
docker compose ps
docker compose logs -f timescaledb
docker compose logs -f mosquitto
docker compose exec timescaledb psql -U meshforge -d meshforge
```

Pour repartir d'une DB locale vide :

```bash
docker compose down -v
docker compose up -d
```

Ça supprime les données locales.

---

## 🚢 Production

Deux modes :

- Docker Compose classique : `docker-compose.yml` + `docker-compose.prod.yml`
- Portainer : `docker-compose.portainer.yml`

### Production avec Docker Compose

```bash
cp .env.example .env
```

Renseigne au minimum :

```env
DB_PASSWORD=...
ADMIN_SESSION_SECRET=...
MQTT_USERNAME=...
MQTT_PASSWORD=...
MESHTASTIC_CHANNEL_KEYS=Fr_Balise:AQ==
NEXT_PUBLIC_APP_URL=https://ton-domaine.example
```

Puis lance :

```bash
yarn docker:prod
```

Créer un compte admin :

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
docker compose exec app yarn create-admin
```

Crée au moins un compte admin dédié au worker MQTT et un compte admin humain.

Après création du compte worker, mets ses identifiants dans `.env`, puis :

```bash
docker compose restart worker
```

### Production avec Portainer

1. Crée une stack depuis le repository Git.
2. Utilise `docker-compose.portainer.yml`.
3. Ajoute les variables d'environnement dans Portainer :

```env
DB_PASSWORD=...
ADMIN_SESSION_SECRET=...
MQTT_USERNAME=...
MQTT_PASSWORD=...
MESHTASTIC_CHANNEL_KEYS=Fr_Balise:AQ==
NEXT_PUBLIC_APP_URL=https://ton-domaine.example
```

4. Déploie la stack.
5. Ouvre une console dans `meshforge-app`, puis crée un admin :

```bash
yarn create-admin
```

6. Renseigne `/admin/config`, notamment l'onglet `Légal`.

### Notes prod

- `DB_PASSWORD` est passé brut à Postgres, app, worker et broker. Les caractères
  spéciaux sont acceptés.
- Si on change `DB_PASSWORD` sur une DB existante, aligner aussi Postgres :
  `ALTER USER meshforge WITH PASSWORD 'NEW_PASSWORD'`.
- Le broker prod utilise `mosquitto-go-auth`. Sa config est un template :
  `mosquitto/entrypoint.sh` remplacer `__DB_PASSWORD__` au démarrage.
- Les relais créent leurs identifiants MQTT via `/register`.
- Canaux publics, bornes carte, zoom, seuils, mentions légales et onboarding MQTT
  se règlent dans `/admin/config`.
- `MQTT_PROTO_DEBUG=1` active les logs dev des paquets protobuf `/e/` :
  réception, enveloppe, raison de drop et fixture base64 en cas d'échec.

---

## 🧰 Scripts

| Commande                    | Description                                  |
| --------------------------- | -------------------------------------------- |
| `yarn dev`                  | Serveur Next.js (dashboard)                  |
| `yarn worker:dev`           | Worker MQTT en watch (ingestion)             |
| `yarn build` / `yarn start` | Build & run production                       |
| `yarn test`                 | Tests Vitest (logique pure, TDD)             |
| `yarn typecheck`            | `tsc --noEmit` (TypeScript strict)           |
| `yarn lint`                 | ESLint                                       |
| `yarn create-admin`         | Crée un compte admin (DB, bcrypt)            |
| `yarn docker:prod`          | Build + lance tout le stack en Docker (prod) |

---

## 🔒 Privacy & RGPD

Politique : **public par défaut** (norme Meshtastic — un node qui uplinke est diffusé largement), **mais** consentement respecté à la source et droit de retrait.

- **`precision_bits`** du node honoré : on n'affiche jamais une position plus précise que ce que le node diffuse.
- **`ok_to_mqtt = false`** → node exclu de l'affichage.
- **Nodes mobiles** → position snappée sur une cellule **~500 m constante** (jamais re-randomisée : un flou aléatoire se moyennerait et révélerait le vrai point).
- **`Fr_EMCOM`** (urgence) + canaux privés/chiffrés → contenu et positions **jamais** exposés.
- **Opt-out, anonymisation et suppression** depuis `/node/[id]` (admin). L'anonymisation est **permanente** : les noms ne reviennent pas au prochain `nodeinfo` (colonne `anonymized`).

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
