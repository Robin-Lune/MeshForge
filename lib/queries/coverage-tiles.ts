// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import { tileCount } from "../tiles";
import {
  getSetting,
  MAX_COVERAGE_TILE_ZOOM,
  MIN_COVERAGE_TILE_ZOOM,
} from "./settings";
import type { CoverageResponse, CoverageTile, MapBounds } from "../../types";

// ---------------------------------------------------------------------------
// Couverture radio agrégée par tuile (couche « à la VeloViewer » de la carte).
//
// QUESTION POSÉE : « depuis ce point du territoire, est-ce que je passe, et
// vers combien de relais ? »
//
// L'OBSERVATION ATOMIQUE est une ligne de paquet `position` : elle porte À LA
// FOIS la position de l'émetteur (colonnes lat/lon, exactes) ET la mesure du
// récepteur (snr/rssi/hop_count/gateway_id) — cf. « une ligne = un paquet capté
// par un relais » (db/init.sql). On n'a donc RIEN à joindre vers nodes.last_lat :
// pas de position périmée, pas d'erreur d'attribution sur un mobile. C'est ce
// qui rend cette agrégation robuste, et c'est la raison de se limiter aux
// paquets qui transportent leur propre position.
//
// TROIS PIÈGES, TROIS FILTRES :
//
// 1. `gateway_id <> node_id` — un node qui pousse SA PROPRE position en MQTT ne
//    prouve aucune couverture radio : le paquet n'a jamais voyagé sur les ondes.
//    Même barrière que SELECT_OBSERVATIONS.
//
// 2. `hop_count = 0` — OBLIGATOIRE, et pas seulement comme second garde-fou
//    anti-MQTT : dès le hop 1, le SNR mesuré est celui du DERNIER RELAIS, dont
//    la position est ailleurs. Colorier la tuile de l'émetteur avec ce SNR
//    attribuerait la mesure au mauvais endroit. Hop 0 est le seul cas où
//    position et SNR décrivent le même point.
//    (Les liens relayés restent exploitables via traceroute_segments /
//    node_neighbors, qui portent un SNR par saut — piste séparée, non traitée
//    ici car ces tables n'ont pas de position et exigent un rapprochement
//    temporel avec le dernier paquet position de l'émetteur.)
//
// 3. `precision_bits >= $1` — un node peut diffuser une position volontairement
//    grossière. Meshtastic tronque aux N bits de poids fort, soit 360/2^N degrés
//    de résolution ; une tuile de zoom Z fait 360/2^Z de large. Donc N >= Z
//    garantit que le node tombe dans UNE tuile et pas étalé au hasard sur
//    plusieurs (cf. lib/tiles.ts). Champ absent = pleine précision : c'est le
//    défaut Meshtastic (sans réglage de position imprécise, la position émise
//    est exacte), et il n'existe pas de colonne dédiée — la valeur ne vit que
//    dans le JSONB.
//
// LIMITE RÉSIDUELLE ASSUMÉE : une gateway qui souscrirait au downlink MQTT et
// re-publierait ce qu'elle y lit est indétectable avec les colonnes actuelles
// (ni via_mqtt, ni packet_id, ni rx_time ne sont persistés).
//
// COORDONNÉES ABERRANTES : db/migrations/002 répare `nodes`, PAS `packets`. La
// fenêtre de 30 jours peut donc encore contenir des (0,0) et des hors-plage
// antérieurs au correctif `decodePosition`. On reprend ici le prédicat de
// validité de cette migration, et on clippe en plus sur les bornes de carte
// configurées quand elles existent.
// ---------------------------------------------------------------------------

const WINDOW = "30 days";

// Un paquet POSITION reçu en direct par une gateway tierce, géographiquement
// exploitable. $1 = zoom (exposant de la grille ET seuil de precision_bits).
const RADIO_PREDICATE = `
    p.received_at > NOW() - INTERVAL '${WINDOW}'
    AND p.packet_type = 'position'
    AND p.gateway_id IS NOT NULL
    AND p.node_id IS NOT NULL
    AND p.gateway_id <> p.node_id
    AND p.hop_count = 0
    AND p.snr IS NOT NULL
    AND p.channel IS DISTINCT FROM 'Fr_EMCOM'
    AND p.lat IS NOT NULL AND p.lon IS NOT NULL
    AND NOT (p.lat = 0 AND p.lon = 0)
    AND p.lat BETWEEN -85 AND 85
    AND p.lon BETWEEN -180 AND 180
    AND CASE
          WHEN jsonb_typeof(p.raw->'payload'->'precision_bits') = 'number'
          THEN (p.raw->'payload'->>'precision_bits')::numeric
          ELSE 32
        END >= $1`;

// Projection Web Mercator identique à lonLatToTile (lib/tiles.ts) : la
// réponse ne transporte que (x,y), le client reconstruit la géométrie.
// Le CLAMP dans [0, 2^z - 1] reproduit celui du jumeau TypeScript : sans lui,
// une longitude de 180 pile (admise par le prédicat, et atteignable depuis une
// coordonnée corrompue puisque la migration 002 n'a réparé que `nodes`) donne
// tx = 2^z, soit une colonne hors grille — le client dessinerait alors une
// tuile fantôme au-delà de l'antiméridien.
// Toute modification ici doit être répercutée dans lonLatToTile et revalidée
// par scripts/check-tile-parity.ts (le SQL est le seul des deux à tourner en
// production : c'est lui qui range les paquets dans les tuiles).
// Exporté pour que scripts/check-tile-parity.ts éprouve CETTE expression-ci et
// non une transcription : une copie qui dérive ne prouverait plus rien.
export const TILE_XY = `
    least(greatest(
      floor((p.lon + 180.0) / 360.0 * (2 ^ $1)::double precision)::int, 0),
      (2 ^ $1)::int - 1)                                        AS tx,
    least(greatest(
      floor((1.0 - asinh(tan(radians(p.lat))) / pi()) / 2.0
            * (2 ^ $1)::double precision)::int, 0),
      (2 ^ $1)::int - 1)                                        AS ty`;

// snrP90 plutôt que le max : sur une tuile bien échantillonnée, le max isole le
// paquet le plus chanceux (propagation exceptionnelle, ducting) et surestime la
// couverture réelle. Le p90 reste « le meilleur lien atteignable » sans se faire
// dicter par un unique coup de chance. Le max est conservé pour l'infobulle.
// PAS de moyenne : elle serait tirée vers le bas par les gateways lointaines,
// donc une tuile entendue par 5 relais scorerait PIRE qu'une tuile entendue par
// un seul relais proche — l'inverse de ce qu'on veut montrer.
const AGGREGATES = `
    percentile_cont(0.9) WITHIN GROUP (ORDER BY p.snr)::real AS "snrP90",
    max(p.snr)::real                AS "snrMax",
    count(DISTINCT p.gateway_id)::int AS "gateways",
    count(DISTINCT p.node_id)::int    AS "nodes",
    count(*)::int                     AS "samples"`;

// PRIVACY : opt-out RGPD sur l'émetteur. Pas de jointure sur la gateway,
// volontairement — sa position est hors sujet (on attribue la mesure à
// l'émetteur), et une gateway non localisée reste un relais réellement
// joignable : elle doit compter dans la redondance.
//
// DÉDUPLICATION (base) — une RÉCEPTION physique peut produire DEUX lignes.
// Le worker souscrit à `/json/` ET à `/e/` ; une passerelle qui a activé la
// sortie JSON en plus du chiffrement — ce que fait la configuration
// recommandée par le projet (.env.example livre les PSK renseignées, et
// DEFAULT_MQTT_ONBOARDING active jsonOutputEnabled) — republie donc chaque
// paquet capté sur les deux topics. `insertPacket` n'a ni contrainte d'unicité
// ni ON CONFLICT : les deux lignes entrent.
//
// Sans correction, cette passerelle pèse DOUBLE dans le percentile qui colore
// la tuile : une tuile entendue à −16 dB par une passerelle « JSON+chiffré » et
// à −5 dB par une autre est peinte d'un cran trop sévère, uniquement parce que
// le propriétaire du premier relais a coché une case.
//
// CLÉ = (passerelle, id de paquet), surtout PAS l'id seul : deux passerelles
// distinctes entendant le même paquet doivent rester DEUX lignes — c'est
// exactement ce qui mesure la redondance.
//
// Les lignes SANS id ne sont pas dédupliquées et sont toutes conservées : les
// regrouper reviendrait à en supprimer arbitrairement (l'id manque quand
// MeshPacket.id vaut 0, piège proto3 du commit 7e7d4ad).
const buildQuery = (bounded: boolean): string => `
  WITH base AS (
    SELECT
      p.node_id, p.gateway_id, p.snr, p.lat, p.lon, p.received_at,
      p.raw->>'id' AS pkt_id
    FROM packets p
    JOIN nodes nd ON nd.node_id = p.node_id AND NOT nd.excluded
    WHERE${RADIO_PREDICATE}${
      bounded
        ? `
      AND p.lat BETWEEN $2 AND $3
      AND p.lon BETWEEN $4 AND $5`
        : ""
    }
  ),
  dedup AS (
    -- Branche parenthésée : sans cela, le ORDER BY se rattacherait à l'UNION
    -- entière et non au DISTINCT ON (erreur de syntaxe Postgres).
    (
      SELECT DISTINCT ON (gateway_id, pkt_id) *
      FROM base
      WHERE pkt_id IS NOT NULL
      ORDER BY gateway_id, pkt_id, received_at
    )
    UNION ALL
    SELECT * FROM base WHERE pkt_id IS NULL
  )
  SELECT
${TILE_XY},
${AGGREGATES}
  FROM dedup p
  GROUP BY tx, ty
`;

const SELECT_COVERAGE_TILES = buildQuery(false);
const SELECT_COVERAGE_TILES_BOUNDED = buildQuery(true);

interface CoverageRow {
  tx: number | string;
  ty: number | string;
  snrP90: number | null;
  snrMax: number | null;
  gateways: number | string;
  nodes: number | string;
  samples: number | string;
}

// Normalise les lignes pg (les entiers castés ::int reviennent en number, mais
// on coerce quand même — même prudence que toObservations, un COUNT non casté
// arriverait en string). snr null préservé : une tuile sans SNR exploitable est
// une anomalie qu'on ne veut pas maquiller en 0 dB.
export function toCoverageTiles(rows: CoverageRow[]): CoverageTile[] {
  return rows.map((r) => ({
    x: Number(r.tx),
    y: Number(r.ty),
    snrP90: r.snrP90 === null ? null : Number(r.snrP90),
    snrMax: r.snrMax === null ? null : Number(r.snrMax),
    gateways: Number(r.gateways),
    nodes: Number(r.nodes),
    samples: Number(r.samples),
  }));
}

// Le zoom vient du réglage admin (déjà validé à l'écriture) mais il alimente ici
// un exposant SQL : on le re-verrouille avant usage. Défense en profondeur
// contre une valeur écrite hors de l'API (psql à la main, restauration d'un
// dump antérieur à la validation).
export function assertTileZoom(z: number): number {
  if (
    !Number.isInteger(z) ||
    z < MIN_COVERAGE_TILE_ZOOM ||
    z > MAX_COVERAGE_TILE_ZOOM
  ) {
    throw new Error(`maille de couverture hors plage : ${z}`);
  }
  return z;
}

// Cache mémoire : la couverture bouge lentement (fenêtre 30 j) et la requête
// balaie des chunks compressés.
// La clé couvre TOUTES les entrées de la requête — zoom ET bornes de carte.
// Une clé sur le seul zoom servirait l'ancien découpage pendant 10 min après un
// élargissement des bornes en admin : le territoire nouvellement inclus
// s'afficherait « non exploré » alors que les paquets existent. Une clé
// complète rend le cache auto-corrigeant, sans hook d'invalidation à câbler
// depuis setSetting (qui créerait au passage un cycle d'import).
const TTL_MS = 600_000; // 10 min
const cache = new Map<string, { value: CoverageResponse; at: number }>();

const cacheKey = (z: number, bounds: MapBounds | null): string =>
  bounds
    ? `${z}|${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
    : `${z}|open`;

export async function getCoverageTiles(): Promise<CoverageResponse> {
  // Les DEUX réglages sont lus avant la consultation du cache : ils entrent
  // tous deux dans la clé.
  const z = assertTileZoom(await getSetting("coverage_tile_zoom"));
  const bounds = await getSetting("map_bounds");

  const key = cacheKey(z, bounds);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const { rows } = bounds
    ? await pool.query<CoverageRow>(SELECT_COVERAGE_TILES_BOUNDED, [
        z,
        bounds.south,
        bounds.north,
        bounds.west,
        bounds.east,
      ])
    : await pool.query<CoverageRow>(SELECT_COVERAGE_TILES, [z]);

  const value: CoverageResponse = {
    z,
    tileCount: tileCount(z),
    tiles: toCoverageTiles(rows),
  };
  cache.set(key, { value, at: Date.now() });
  return value;
}
