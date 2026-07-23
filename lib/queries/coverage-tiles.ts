// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import { MESHTASTIC_COORDINATE_SCALE, tileCount } from "../tiles";
import {
  getSetting,
  MAX_COVERAGE_TILE_ZOOM,
  MIN_COVERAGE_TILE_ZOOM,
} from "./settings";
import type { CoverageResponse, CoverageTile, MapBounds } from "../../types";

const WINDOW = "30 days";
const DEDUP_WINDOW = "5 minutes";
const MAX_PACKET_ID = 4_294_967_295;

// Une observation est la réception directe d'un paquet POSITION par une
// gateway tierce. Position et SNR viennent ainsi du même paquet et du même lien
// radio. Les bornes SNR sont volontairement larges : elles éliminent seulement
// les valeurs manifestement corrompues, sans prétendre normaliser les matériels.
const RADIO_PREDICATE = `
    p.received_at > NOW() - INTERVAL '${WINDOW}'
    AND p.packet_type = 'position'
    AND p.gateway_id IS NOT NULL
    AND p.node_id IS NOT NULL
    AND p.gateway_id <> p.node_id
    AND p.hop_count = 0
    AND p.snr BETWEEN -30 AND 30
    AND p.channel = ANY($3::text[])
    AND p.channel <> 'Fr_EMCOM'
    AND p.lat IS NOT NULL AND p.lon IS NOT NULL
    AND NOT (p.lat = 0 AND p.lon = 0)
    AND p.lat BETWEEN -85 AND 85
    AND p.lon BETWEEN -180 AND 180
    AND p.node_id ~ '^![0-9a-fA-F]{8}$'
    AND p.gateway_id ~ '^![0-9a-fA-F]{8}$'
    AND ($2::boolean OR p.raw->>'meshforge_demo' IS DISTINCT FROM 'true')
    AND jsonb_typeof(p.raw->'payload'->'precision_bits') = 'number'
    AND (p.raw->'payload'->>'precision_bits')::numeric BETWEEN 1 AND 32
    AND (p.raw->'payload'->>'precision_bits')::numeric =
        trunc((p.raw->'payload'->>'precision_bits')::numeric)
    AND jsonb_typeof(p.raw->'id') = 'number'
    AND (p.raw->>'id')::numeric BETWEEN 1 AND ${MAX_PACKET_ID}
    AND (p.raw->>'id')::numeric = trunc((p.raw->>'id')::numeric)`;

const tileXSql = (lon: string): string => `least(greatest(
      floor((${lon} + 180.0) / 360.0 * (2 ^ $1)::double precision)::int, 0),
      (2 ^ $1)::int - 1)`;

const tileYSql = (lat: string): string => `least(greatest(
      floor((1.0 - asinh(tan(radians(${lat}))) / pi()) / 2.0
            * (2 ^ $1)::double precision)::int, 0),
      (2 ^ $1)::int - 1)`;

// Exporté pour le contrôle de parité SQL ↔ TypeScript.
export const TILE_XY = `
    ${tileXSql("p.lon")} AS tx,
    ${tileYSql("p.lat")} AS ty`;

// snrP90 plutôt que le max : sur une tuile bien échantillonnée, le max isole le
// paquet le plus chanceux (propagation exceptionnelle, ducting) et surestime la
// couverture réelle. Le p90 reste « le meilleur lien atteignable » sans se faire
// dicter par un unique coup de chance. Le max est conservé pour l'infobulle.
// PAS de moyenne : elle serait tirée vers le bas par les gateways lointaines,
// donc une tuile entendue par 5 relais scorerait PIRE qu'une tuile entendue par
// un seul relais proche — l'inverse de ce qu'on veut montrer.
const AGGREGATES = `
    percentile_cont(0.9) WITHIN GROUP (ORDER BY t.snr)::real AS "snrP90",
    max(t.snr)::real               AS "snrMax",
    count(DISTINCT t.node_id)::int AS "nodes",
    count(DISTINCT ROW(
      t.node_id, t.pkt_id, t.lat, t.lon, t.emission_seq
    ))::int AS "transmissions",
    count(*)::int AS "samples",
    count(DISTINCT (t.received_at AT TIME ZONE 'UTC')::date)::int AS "days"`;

// `precision_bits` masque les coordonnées entières degrés×1e7. On reconstitue
// donc la demi-largeur de cette zone puis on compare ses quatre extrêmes à la
// projection Web Mercator. Une simple comparaison precision_bits/zoom serait
// fausse : les deux grilles n'ont ni la même origine ni la même projection.
//
// L'id MeshPacket n'est unique que quelques minutes par émetteur. La requête
// sépare donc deux occurrences distantes de plus de DEDUP_WINDOW, puis retire
// les doublons /json/ + /e/ à l'intérieur de chaque occurrence et gateway.
const buildQuery = (bounded: boolean): string => `
  WITH candidates AS (
    SELECT
      p.node_id, p.gateway_id, p.snr, p.lat, p.lon, p.received_at,
      (p.raw->'payload'->>'precision_bits')::int AS precision_bits,
      (p.raw->>'id')::bigint AS pkt_id
    FROM packets p
    JOIN nodes nd ON nd.node_id = p.node_id AND NOT nd.excluded
    WHERE${RADIO_PREDICATE}${
      bounded
        ? `
      AND p.lat BETWEEN $4 AND $5
      AND p.lon BETWEEN $6 AND $7`
        : ""
    }
  ),
  uncertainty AS (
    SELECT
      p.*,
      CASE
        WHEN p.precision_bits = 32 THEN 0.0
        ELSE power(2.0, 31 - p.precision_bits)
             / ${MESHTASTIC_COORDINATE_SCALE}.0
      END AS half_span
    FROM candidates p
  ),
  located AS (
    SELECT
      p.*,
      ${tileXSql("p.lon")} AS tx,
      ${tileYSql("p.lat")} AS ty,
      ${tileXSql("p.lon - p.half_span")} AS west_tx,
      ${tileXSql("p.lon + p.half_span")} AS east_tx,
      ${tileYSql("p.lat - p.half_span")} AS south_ty,
      ${tileYSql("p.lat + p.half_span")} AS north_ty
    FROM uncertainty p
    WHERE
      p.lon - p.half_span >= -180
      AND p.lon + p.half_span <= 180
      AND p.lat - p.half_span >= -85
      AND p.lat + p.half_span <= 85
  ),
  base AS (
    SELECT
      tx, ty, node_id, gateway_id, snr, lat, lon, received_at, pkt_id
    FROM located
    WHERE tx = west_tx
      AND tx = east_tx
      AND ty = south_ty
      AND ty = north_ty
  ),
  numbered AS (
    SELECT
      p.*,
      row_number() OVER (
        PARTITION BY p.node_id, p.pkt_id, p.lat, p.lon
        ORDER BY p.received_at, p.gateway_id, p.snr
      ) AS reception_order
    FROM base p
  ),
  ordered AS (
    SELECT
      p.*,
      lag(p.received_at) OVER (
        PARTITION BY p.node_id, p.pkt_id, p.lat, p.lon
        ORDER BY p.reception_order
      ) AS previous_at
    FROM numbered p
  ),
  sessionized AS (
    SELECT
      p.*,
      sum(
        CASE
          WHEN p.previous_at IS NULL
            OR p.received_at - p.previous_at > INTERVAL '${DEDUP_WINDOW}'
          THEN 1
          ELSE 0
        END
      ) OVER (
        PARTITION BY p.node_id, p.pkt_id, p.lat, p.lon
        ORDER BY p.reception_order
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS emission_seq
    FROM ordered p
  ),
  dedup AS (
    SELECT
      p.tx, p.ty, p.node_id, p.gateway_id, p.pkt_id, p.lat, p.lon,
      p.emission_seq,
      min(p.snr)::real AS snr,
      min(p.received_at) AS received_at
    FROM sessionized p
    GROUP BY
      p.tx, p.ty, p.node_id, p.gateway_id, p.pkt_id, p.lat, p.lon,
      p.emission_seq
  ),
  tuiles AS (
    SELECT
      p.tx, p.ty, p.node_id, p.gateway_id, p.snr, p.pkt_id,
      p.lat, p.lon, p.emission_seq, p.received_at
    FROM dedup p
  ),
  -- REDONDANCE : « depuis UN POINT de cette tuile, combien de relais
  -- j'atteins ? » C'est une propriété d'un POINT, pas de l'union de la tuile.
  -- Un count(DISTINCT gateway_id) à l'échelle de la tuile répondrait à une tout
  -- autre question — « combien de relais ont entendu QUOI QUE CE SOIT ici » —
  -- et surestimerait la résilience : trois sondes aux quatre coins, entendues
  -- chacune par un relais différent, donneraient « 3 relais, résilient » alors
  -- qu'aucun emplacement n'en atteint plus d'un. Pour une couche dont l'usage
  -- est de décider où poser un relais, c'est exactement l'erreur à ne pas faire.
  --
  -- On compte donc par TRANSMISSION : une émission unique, depuis un point
  -- unique, à un instant unique, reçue simultanément par N passerelles. Le
  -- maximum sur la tuile se lit alors « au moins un emplacement d'ici atteint N
  -- relais » — une affirmation vraie et vérifiable.
  --
  -- Un paquet sans id fiable est rejeté en amont : sans clé commune, plusieurs
  -- gateways ou les flux /json/ et /e/ seraient impossibles à corréler.
  redondance AS (
    SELECT tx, ty, max(gw)::int AS "gateways"
    FROM (
      SELECT tx, ty, count(DISTINCT gateway_id) AS gw
      FROM tuiles
      GROUP BY tx, ty, node_id, pkt_id, lat, lon, emission_seq
    ) g
    GROUP BY tx, ty
  ),
  mesures AS (
    SELECT t.tx, t.ty,
${AGGREGATES}
    FROM tuiles t
    GROUP BY t.tx, t.ty
  )
  SELECT m.tx, m.ty, m."snrP90", m."snrMax",
         r."gateways", m."nodes", m."transmissions", m."samples", m."days"
  FROM mesures m
  JOIN redondance r ON r.tx = m.tx AND r.ty = m.ty
`;

export const SELECT_COVERAGE_TILES = buildQuery(false);
export const SELECT_COVERAGE_TILES_BOUNDED = buildQuery(true);

interface CoverageRow {
  tx: number | string;
  ty: number | string;
  snrP90: number | null;
  snrMax: number | null;
  gateways: number | string;
  nodes: number | string;
  transmissions: number | string;
  samples: number | string;
  days: number | string;
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
    transmissions: Number(r.transmissions),
    samples: Number(r.samples),
    days: Number(r.days),
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
// La clé couvre TOUTES les entrées de la requête : zoom, bornes, canaux publics
// et éventuel mode démo local.
// On met en cache la PROMESSE, pas la valeur résolue. /api/coverage est public,
// force-dynamic et sans authentification : à l'expiration de l'entrée, N
// visiteurs simultanés lanceraient chacun le balayage 30 jours (percentile plus
// deux count(DISTINCT) sur des chunks compressés) avant que le premier ne
// remplisse le cache, saturant le pool pendant que le reste de l'API attend
// derrière. En stockant la promesse dès son lancement, les arrivants pendant le
// calcul s'y raccrochent : une seule requête part.
const TTL_MS = 600_000; // 10 min
const cache = new Map<string, { promesse: Promise<CoverageResponse>; at: number }>();

// Exportée pour être testable : c'est ici que se joue l'invariant dont l'absence
// servait l'ancien découpage pendant 10 min après un changement de bornes.
export const cacheKey = (
  z: number,
  bounds: MapBounds | null,
  publicChannels: string[] = [],
  includeDemo = false,
): string => {
  const boundsKey = bounds
    ? `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
    : "open";
  return `${z}|${boundsKey}|${[...publicChannels].sort().join(",")}|demo:${includeDemo}`;
};

async function interrogerBase(
  z: number,
  bounds: MapBounds | null,
  publicChannels: string[],
  includeDemo: boolean,
): Promise<CoverageResponse> {
  const { rows } = bounds
    ? await pool.query<CoverageRow>(SELECT_COVERAGE_TILES_BOUNDED, [
        z,
        includeDemo,
        publicChannels,
        bounds.south,
        bounds.north,
        bounds.west,
        bounds.east,
      ])
    : await pool.query<CoverageRow>(SELECT_COVERAGE_TILES, [
        z,
        includeDemo,
        publicChannels,
      ]);

  return { z, tileCount: tileCount(z), tiles: toCoverageTiles(rows) };
}

export async function getCoverageTiles(): Promise<CoverageResponse> {
  const [rawZoom, bounds, publicChannels] = await Promise.all([
    getSetting("coverage_tile_zoom"),
    getSetting("map_bounds"),
    getSetting("public_channels"),
  ]);
  const z = assertTileZoom(rawZoom);
  // Les seeds sont marqués dans raw et refusés par défaut. Même une variable
  // oubliée sur le serveur ne peut pas les activer en production.
  const includeDemo =
    process.env.NODE_ENV !== "production" &&
    process.env.COVERAGE_INCLUDE_DEMO === "1";

  const key = cacheKey(z, bounds, publicChannels, includeDemo);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promesse;

  const promesse = interrogerBase(z, bounds, publicChannels, includeDemo);
  cache.set(key, { promesse, at: Date.now() });

  // Un ÉCHEC ne doit pas être servi pendant 10 minutes : on retire l'entrée pour
  // que la tentative suivante reparte. Le test d'identité évite de supprimer une
  // entrée plus récente posée entre-temps.
  promesse.catch(() => {
    if (cache.get(key)?.promesse === promesse) cache.delete(key);
  });

  return promesse;
}
