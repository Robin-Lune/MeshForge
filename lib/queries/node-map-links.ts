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
  sources: Record<string, string | number> | null;
}

// Normalise (SNR arrondi + snap privacy, hop number|null, counts en number).
export function toNodeMapLinks(rows: MapLinkRow[]): NodeMapLink[] {
  return rows.map((r) => {
    const located = r.lat != null && r.lon != null;
    const pos =
      located && r.isMobile !== false ? snapToGrid(r.lat!, r.lon!) : { lat: r.lat, lon: r.lon };
    const sources: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.sources ?? {})) sources[k] = Number(v);
    return {
      nodeId: r.nodeId,
      name: r.name,
      snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
      hop: r.hop == null ? null : Number(r.hop),
      lat: pos.lat,
      lon: pos.lon,
      sources,
    };
  });
}

// Voisinage d'un node pour la mini-carte :
//  - NeighborInfo récent = source principale, dernier SNR par voisin ;
//  - paquets directs hop_count=0 dans les deux sens = fallback.
//  - extrémités des derniers traceroutes = nodes atteints à afficher, avec le
//    vrai chemin segmenté au hover.
// PRIVACY : uniquement des nœuds affichables (localisés, non exclus).
const SELECT_MAP_LINKS = `
  WITH neighbor_latest AS (
    SELECT DISTINCT ON (other)
      other,
      snr,
      received_at
    FROM (
      SELECT nn.neighbor_id AS other, nn.snr, nn.received_at
      FROM node_neighbors nn
      WHERE nn.node_id = $1
        AND nn.received_at > NOW() - INTERVAL '30 days'
      UNION ALL
      SELECT nn.node_id AS other, nn.snr, nn.received_at
      FROM node_neighbors nn
      WHERE nn.neighbor_id = $1
        AND nn.received_at > NOW() - INTERVAL '30 days'
    ) n
    ORDER BY other, received_at DESC
  ),
  direct_packets AS (
    SELECT
      CASE WHEN p.gateway_id = $1 THEN p.node_id ELSE p.gateway_id END AS other,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY p.snr) AS snr,
      COUNT(*) AS packets
    FROM packets p
    WHERE (p.gateway_id = $1 OR p.node_id = $1)
      AND p.hop_count = 0
      AND p.gateway_id IS NOT NULL AND p.node_id IS NOT NULL
      AND p.gateway_id <> p.node_id
      AND p.received_at > NOW() - INTERVAL '30 days'
    GROUP BY other
  ),
  direct_links AS (
    SELECT
      COALESCE(n.other, d.other) AS other,
      COALESCE(n.snr, d.snr) AS snr,
      0 AS hop,
      jsonb_strip_nulls(jsonb_build_object(
        'neighborinfo', CASE WHEN n.other IS NULL THEN NULL ELSE 1 END,
        'direct_packets', d.packets
      )) AS sources
    FROM neighbor_latest n
    FULL JOIN direct_packets d ON d.other = n.other
  ),
  trace_packets AS (
    SELECT
      CASE WHEN source_node = $1 THEN target_node ELSE source_node END AS other,
      source_node,
      target_node,
      received_at,
      packet_id
    FROM traceroute_segments
    WHERE (source_node = $1 OR target_node = $1)
      AND received_at > NOW() - INTERVAL '30 days'
    GROUP BY source_node, target_node, received_at, packet_id
  ),
  trace_latest AS (
    SELECT DISTINCT ON (other)
      other,
      source_node,
      target_node,
      received_at,
      packet_id
    FROM trace_packets
    ORDER BY other, received_at DESC
  ),
  trace_nodes AS (
    SELECT
      tl.other,
      NULL::real AS snr,
      GREATEST(COUNT(*) FILTER (WHERE ts.direction = 'forward') - 1, 0)::int AS hop,
      1 AS traceroute
    FROM trace_latest tl
    JOIN traceroute_segments ts
      ON ts.source_node = tl.source_node
     AND ts.target_node = tl.target_node
     AND ts.received_at = tl.received_at
     AND ts.packet_id IS NOT DISTINCT FROM tl.packet_id
    GROUP BY tl.other
  ),
  links AS (
    SELECT
      COALESCE(d.other, t.other) AS other,
      COALESCE(d.snr, t.snr) AS snr,
      COALESCE(d.hop, t.hop) AS hop,
      COALESCE(d.sources, '{}'::jsonb) ||
        jsonb_strip_nulls(jsonb_build_object(
          'traceroute', CASE WHEN t.other IS NULL THEN NULL ELSE t.traceroute END
        )) AS sources
    FROM direct_links d
    FULL JOIN trace_nodes t ON t.other = d.other
  )
  SELECT
    l.other                               AS "nodeId",
    n.short_name                          AS "name",
    l.snr, l.hop,
    n.last_lat                            AS "lat",
    n.last_lon                            AS "lon",
    n.is_mobile                           AS "isMobile",
    l.sources                             AS "sources"
  FROM links l
  JOIN nodes subject ON subject.node_id = $1
  JOIN nodes n ON n.node_id = l.other
  WHERE n.last_lat IS NOT NULL AND n.last_lon IS NOT NULL AND NOT n.excluded
    AND subject.last_lat IS NOT NULL AND subject.last_lon IS NOT NULL
    AND (
      6371 * 2 * asin(sqrt(
        pow(sin(radians(n.last_lat - subject.last_lat) / 2), 2) +
        cos(radians(subject.last_lat)) * cos(radians(n.last_lat)) *
        pow(sin(radians(n.last_lon - subject.last_lon) / 2), 2)
      ))
    ) <= 20
  ORDER BY "name"
`;

export async function getNodeMapLinks(nodeId: string): Promise<NodeMapLink[]> {
  const { rows } = await pool.query<MapLinkRow>(SELECT_MAP_LINKS, [nodeId]);
  return toNodeMapLinks(rows);
}
