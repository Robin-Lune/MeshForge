// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import { snapToGrid } from "../privacy";
import type { NodeMapLink } from "../../types";

interface MapLinkRow {
  nodeId: string;
  name: string | null;
  snr: string | number | null;
  hop: string | number | null;
  lat: number | null;
  lon: number | null;
  isMobile: boolean | null;
  types: Record<string, string | number> | null;
}

// Normalise (SNR arrondi + snap privacy, hop number|null, counts en number).
export function toNodeMapLinks(rows: MapLinkRow[]): NodeMapLink[] {
  return rows.map((r) => {
    const located = r.lat != null && r.lon != null;
    const pos =
      located && r.isMobile !== false ? snapToGrid(r.lat!, r.lon!) : { lat: r.lat, lon: r.lon };
    const types: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.types ?? {})) types[k] = Number(v);
    return {
      nodeId: r.nodeId,
      name: r.name,
      snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
      hop: r.hop == null ? null : Number(r.hop),
      lat: pos.lat,
      lon: pos.lon,
      types,
    };
  });
}

// Connectivité locale d'un node sur 30 j pour la mini-carte : tout ce à quoi il
// est lié (paquets réels captés dans les 2 sens + voisins NeighborInfo), agrégé
// par nœud : hop MIN, SNR médian, et nombre de paquets PAR TYPE (pour le filtre).
// PRIVACY : uniquement des nœuds affichables (localisés, non exclus).
const SELECT_MAP_LINKS = `
  WITH raw AS (
    SELECT
      CASE WHEN p.gateway_id = $1 THEN p.node_id ELSE p.gateway_id END AS other,
      COALESCE(p.packet_type, 'autre') AS ptype,
      p.hop_count AS hop, p.snr
    FROM packets p
    WHERE (p.gateway_id = $1 OR p.node_id = $1)
      AND p.gateway_id IS NOT NULL AND p.node_id IS NOT NULL
      AND p.gateway_id <> p.node_id
      AND p.received_at > NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT nn.neighbor_id AS other, 'neighborinfo' AS ptype, 0 AS hop, nn.snr
    FROM node_neighbors nn
    WHERE nn.node_id = $1 AND nn.received_at > NOW() - INTERVAL '30 days'
  ),
  agg AS (
    SELECT other,
           MIN(hop)                                          AS hop,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY snr)  AS snr
    FROM raw GROUP BY other
  ),
  types AS (
    SELECT other, jsonb_object_agg(ptype, cnt) AS types
    FROM (SELECT other, ptype, COUNT(*) AS cnt FROM raw GROUP BY other, ptype) t
    GROUP BY other
  )
  SELECT
    a.other                               AS "nodeId",
    COALESCE(n.long_name, n.short_name)   AS "name",
    a.snr, a.hop,
    n.last_lat                            AS "lat",
    n.last_lon                            AS "lon",
    n.is_mobile                           AS "isMobile",
    ty.types                              AS "types"
  FROM agg a
  JOIN types ty ON ty.other = a.other
  JOIN nodes n  ON n.node_id = a.other
  WHERE n.last_lat IS NOT NULL AND n.last_lon IS NOT NULL AND NOT n.excluded
  ORDER BY a.hop NULLS LAST, "name"
`;

export async function getNodeMapLinks(nodeId: string): Promise<NodeMapLink[]> {
  const { rows } = await pool.query<MapLinkRow>(SELECT_MAP_LINKS, [nodeId]);
  return toNodeMapLinks(rows);
}
