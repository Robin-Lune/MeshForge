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
- Détail node : historique 30 j, SNR par gateway, distance, télémétrie, voisinage réseau.
- Diagnostic NeighborInfo / Traceroute : mini-carte de voisinage, voisins radio directs et chemins segmentés avec SNR par saut.
- Admin : trames brutes, annonces MQTT, config runtime, RGPD, inscription relais.
- Privacy : public par défaut, mais précision du node respectée + droit de retrait.

---

## 🏗️ Architecture

```text
Nodes Meshtastic ◀──LoRa──▶ gateways MQTT ◀──downlink── Mosquitto
                               │                    │
                               └──── uplink ────────┤
                                                    ├──▶ worker ──▶ TimescaleDB ──▶ carte
Admin /admin/annonces ──protobuf chiffré───────────▶│

Chat USER ouvert : Mosquitto relaie aussi les messages entre gateways.
Chat USER fermé  : les gateways ne reçoivent que les annonces MeshForge.
```

Stack : Next.js 16, React 19, Tailwind v4, MapLibre GL, worker Node/TS, MQTT, TimescaleDB/Postgres 16, Mosquitto.

Principes : worker séparé de Next.js, SQL centralisé dans `lib/queries/`, chat MQTT USER désactivable, zéro dépendance cloud propriétaire.

Le worker ingère les topics Meshtastic `msh/+/+/json/#`, `msh/+/+/map/#` et
`msh/+/+/e/#`. Les paquets `/e/` chiffrés sont décodés uniquement quand la PSK
du canal est fournie via `MESHTASTIC_CHANNEL_KEYS`.

Tables principales :

- `packets` : hypertable TimescaleDB, historique brut normalisé des trames.
- `nodes` : dernier état connu d'un node.
- `node_neighbors` : voisins radio directs déclarés par NeighborInfo.
- `traceroute_segments` : segments RouteDiscovery, un saut par ligne avec SNR.

La carte principale fusionne au survol les observations gateway, les liens directs
NeighborInfo et les sauts prouvés de traceroute sur 7 jours. Les cartes d'information
affichent le NodeID sous le nom lorsqu'il n'est pas déjà utilisé comme titre. Le
diagnostic complet NeighborInfo / Traceroute reste dans la fiche node, section
« Voisinage réseau ».

La liste `/nodes` affiche le nom long en titre puis `nom court · NodeID` en ligne
secondaire quand les deux noms sont connus ; sinon elle affiche le NodeID sans
dupliquer le nom déjà visible.

---

## 🚀 Développement local

**Prérequis** : Node 20.19+, Yarn, Docker.

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

6. Renseigne `/admin/config`, notamment les onglets `Légal` et `MQTT`.

### Chat et annonces MQTT

Dans `/admin/config?tab=mqtt` :

- **Chat MQTT USER activé** ouvre la messagerie MQTT classique entre les
  gateways. Désactivé, leurs uplinks restent ingérés mais seuls les messages
  LoRa et les annonces MeshForge leur parviennent.
- **NodeID réservé aux annonces** identifie les paquets envoyés depuis
  `/admin/annonces`. Il doit respecter le format `!` suivi de 8 caractères
  hexadécimaux et ne correspondre à aucun node physique, par exemple
  `!4d461111` en développement ou `!4d467777` en production.

Les annonces restent disponibles lorsque le chat USER est fermé. Le canal choisi
doit être public, disposer de sa PSK dans `MESHTASTIC_CHANNEL_KEYS` et avoir le
downlink actif sur les gateways concernées. Une annonce est limitée à 200 octets
UTF-8.

### Notes prod

- `packets` est compressée automatiquement après 7 jours et purgée après 60
  jours. Les filtres 24h / 7j / 30j restent intégralement disponibles.
- Sur une base existante, `db/init.sql` ne se rejoue pas automatiquement.
  Appliquer la migration idempotente depuis la racine du projet :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T timescaledb psql -v ON_ERROR_STOP=1 -U meshforge -d meshforge \
  < db/migrations/001_packets_lifecycle.sql
```

  `-T` permet de rediriger le fichier SQL local et `ON_ERROR_STOP` interrompt la
  migration dès la première erreur. Vérifier ensuite les jobs TimescaleDB :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec timescaledb psql -U meshforge -d meshforge -c \
  "SELECT application_name, schedule_interval, config FROM timescaledb_information.jobs WHERE hypertable_name = 'packets' ORDER BY application_name;"
```

  Puis contrôler progressivement la compression des chunks :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec timescaledb psql -U meshforge -d meshforge -c \
  "SELECT chunk_name, range_start, range_end, is_compressed FROM timescaledb_information.chunks WHERE hypertable_name = 'packets' ORDER BY range_start DESC;"
```

  Les politiques tournent en arrière-plan : la migration ne compresse ni ne
  supprime immédiatement les anciennes données.
- Après le déploiement du garde-fou sur les positions `(0,0)`, réparer les nodes
  déjà affectés depuis leur dernier paquet valide connu :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T timescaledb psql -v ON_ERROR_STOP=1 -U meshforge -d meshforge \
  < db/migrations/002_repair_invalid_node_positions.sql
```

  Cette migration est idempotente. Si aucun ancien paquet valide n'existe encore,
  la position invalide est remise à `NULL` plutôt que laissée à `(0,0)`.
- `DB_PASSWORD` est passé brut à Postgres, app, worker et broker. Les caractères
  spéciaux sont acceptés.
- Si on change `DB_PASSWORD` sur une DB existante, aligner aussi Postgres :
  `ALTER USER meshforge WITH PASSWORD 'NEW_PASSWORD'`.
- Le broker prod utilise `mosquitto-go-auth`. Sa config est un template :
  `mosquitto/entrypoint.sh` remplace `__DB_PASSWORD__` au démarrage.
- Les relais créent leurs identifiants MQTT via `/register`.
- Canaux publics, bornes carte, zoom, seuils, mentions légales (éditeur,
  responsable de traitement, contacts, finalités, initiative et bloc libre
  optionnel) et configuration MQTT se règlent dans `/admin/config`. Une nouvelle
  instance utilise des valeurs légales génériques à remplacer avant sa mise en
  ligne.
- `MQTT_PROTO_DEBUG=1` active les logs dev des paquets protobuf `/e/` :
  réception, enveloppe, raison de drop et fixture base64 en cas d'échec. Les
  drops des messages texte MQTT utilisent aussi ce debug.
- Le worker n'ingère aucun message texte MQTT dans la base. Leur éventuelle
  distribution entre USER est assurée directement par Mosquitto lorsque le chat
  est ouvert. Les autres types (`position`, `telemetry`, `nodeinfo`,
  `neighborinfo`, `traceroute`, `map_report`, etc.) restent ingérés.
- Les tables `node_neighbors` et `traceroute_segments` servent au diagnostic
  « Voisinage réseau » de la fiche node : voisins radio directs, traceroute
  segmenté, SNR par saut et animation aller/retour. Avant montée en charge,
  prévoir une politique claire de rétention/index si le volume
  NeighborInfo/Traceroute augmente fortement.

---

## 🧰 Scripts

| Commande                    | Description                                  |
| --------------------------- | -------------------------------------------- |
| `yarn dev`                  | Serveur Next.js (dashboard)                  |
| `yarn worker:dev`           | Worker MQTT en watch (ingestion)             |
| `yarn build` / `yarn start` | Build & run production                       |
| `yarn test`                 | Tests Vitest                                 |
| `yarn test:coverage`        | Tests + couverture (seuils cliquet, joué en CI) |
| `yarn typecheck`            | `tsc --noEmit` (TypeScript strict)           |
| `yarn lint`                 | ESLint                                       |
| `yarn create-admin`         | Crée un compte admin (DB, bcrypt)            |
| `yarn docker:prod`          | Build + lance tout le stack en Docker (prod) |

### Écrire un test

Les tests sont **co-localisés** (`foo.ts` → `foo.test.ts`) et tournent par défaut
en environnement **node** : la majorité porte sur de la logique pure extraite des
requêtes et des composants, et un DOM simulé les ralentirait sans rien apporter.

Pour un test de **composant React**, ouvrir le fichier par ce commentaire — c'est
lui, et lui seul, qui bascule le fichier en jsdom :

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MapLegend } from "@/components/map/MapLegend";
```

Matchers `jest-dom` et démontage entre tests sont fournis par `vitest.setup.ts`.
Gabarit de référence : `components/map/MapLegend.test.tsx`.

**Couverture** : les seuils de `vitest.config.ts` sont des **cliquets** posés
sous le niveau mesuré — ils interdisent la régression, ils n'attestent pas d'une
cible atteinte. Les relever au fil des modules couverts.
À savoir : un fichier sans branche affiche `100 %` de branches (`0/0`), d'où le
seuil sur les *statements*, qui est celui qui mord.

---

## 🔒 Privacy & RGPD

Politique : **public par défaut** (norme Meshtastic — un node qui uplinke est diffusé largement), **mais** consentement respecté à la source et droit de retrait.

- **Nodes mobiles** → position snappée à l'affichage sur une cellule **~500 m constante** (jamais re-randomisée : un flou aléatoire se moyennerait et révélerait le vrai point). Les coordonnées reçues restent en base jusqu'à leur purge. `is_mobile = TRUE` est le **défaut prudent** et la colonne est `NOT NULL` : un node est flouté tant qu'un admin ne l'a pas déclaré relais fixe.
- **Consentement MapReport** : la position d'un paquet `MAP_REPORT` n'est retenue que si le node a activé `has_opted_report_location` ; sinon elle est écartée, y compris du payload brut conservé. ⚠️ Ce garde-fou ne vaut **que pour les MapReport** — un `POSITION_APP` diffusé en clair sur un canal public est ingéré tel quel, conformément au protocole.
- **`ok_to_mqtt`** (réglage « OK to MQTT » du node, firmware ≥ 2.5) : sur le flux chiffré `/e/`, le parseur lit le bit 0 de `Data.bitfield` et **droppe** tout paquet d'un autre node sans ce bit — strict, absent = refus ; les paquets de la passerelle elle-même passent, comme dans le firmware. Le flux `/json/` ne transporte pas le bit : là, seule la passerelle peut l'appliquer.
- **Canaux** : le worker n'ingère **que** les canaux de l'allowlist `public_channels` (default-deny, éditable sur `/admin/config`, affichée sur `/mentions-legales`). C'est elle qui protège, *pas* le chiffrement : un canal `/e/` dont la PSK est fournie via `MESHTASTIC_CHANNEL_KEYS` est bel et bien déchiffré. **Tout canal listé est ingéré et exposé** (carte, toile, fiches, stats) : un canal d'urgence ou privé ne doit simplement pas y figurer. Aucun nom de canal n'est codé en dur.
- **Canal retiré de la liste** : ses données déjà stockées restent jusqu'à la purge de rétention. `/admin/config` propose un bouton explicite « Purger les données hors liste » : paquets, voisinages et traceroutes de ces canaux sont supprimés et la position des nodes concernés est recalculée depuis leur dernier paquet valide restant (ou effacée). Jamais automatique : une faute de frappe dans la liste ne doit pas effacer l'historique.
- **Opt-out, anonymisation et suppression** depuis `/node/[id]` (admin). L'opt-out retire le node de tous les affichages publics individuels, dont `/nodes` et les tableaux « Liens radio » des autres fiches. L'anonymisation retire **durablement les noms des affichages** : ils ne reviennent pas au prochain `nodeinfo` grâce à la colonne `anonymized`, mais restent dans les paquets bruts jusqu'à leur purge automatique selon la durée de conservation. La suppression efface, dans une transaction, les données alors stockées dans `nodes`, `packets`, `node_neighbors` et `traceroute_segments`, quel que soit le rôle du NodeID. Elle ne bloque pas le NodeID : un nouvel uplink MQTT le recrée normalement.
- **`precision_bits`** (précision de position réglée sur l'appareil) : décodé par les parsers et conservé dans `packets.raw`, mais **honoré uniquement par la couche de couverture**. Celle-ci reconstitue la zone d'incertitude du masque Meshtastic et ne retient la mesure que si toute la zone tient dans une seule tuile ; une valeur absente ou invalide est refusée. L'affichage des marqueurs ne le lit pas : le floutage y repose sur `is_mobile`/`snapToGrid`. À ne pas présenter comme une garantie générale.
- **Couche de couverture** (tuiles) : agrégat non attribué (ni `node_id`, ni horodatage précis), utilisable avec une seule sonde, limité aux canaux publics, opt-out RGPD appliqué, et maille bornée à `[12,16]`. La frontière agrégat/individu est documentée dans la doc interne du projet (`.claude/docs/analytics_2.md`).

---

## 🤝 Contribuer

Workflow : branche `feat/…` · `fix/…` · `chore/…` · `refactor/…` → Pull Request vers `main` (branche protégée) → CI verte (typecheck + lint + test) avant merge.

La logique métier suit le cycle **TDD red-green-refactor** (Vitest). Les composants frontend en sont exemptés.

---

## 📄 Licence

Copyright (C) 2026 Robin Lebon — La Forge Numérique.

MeshForge est distribué sous licence **AGPL-3.0-or-later** (GNU Affero General
Public License, version 3 ou toute version ultérieure) — voir [LICENSE](LICENSE).
Identifiant SPDX : `AGPL-3.0-or-later` (déclaré dans `package.json`).

Vous pouvez l'héberger, le modifier et le partager librement, à condition de
publier vos modifications sous la même licence, y compris lorsque vous
l'exploitez uniquement comme service en ligne (article 13 de l'AGPL). Le lien
vers le code source doit rester accessible depuis l'interface.

<div align="center">
<sub>Fait avec 💜 pour le mesh réunionnais 🇷🇪</sub>
</div>
