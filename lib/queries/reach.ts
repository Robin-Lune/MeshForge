// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type { ReachEdge } from "../../types";

interface ReachRow {
  fromId: string;
  toId: string;
  hop: string | number;
}

export function toReachEdges(rows: ReachRow[]): ReachEdge[] {
  return rows.map((r) => ({ fromId: r.fromId, toId: r.toId, hop: Number(r.hop) }));
}

// Arêtes d'atteignabilité ORIENTÉES pour enrichir le survol d'un nœud.
//  - Traceroute : on reconstruit le chemin ordonné de chaque relevé (aller ET
//    retour), puis pour chaque paire pᵢ -> pⱼ (i<j, sens de circulation) on émet
//    un lien orienté avec hop = nb de relais entre eux (j-i-1). D'où l'asymétrie :
//    A→C peut être 1 hop (via B à l'aller) alors que C→A est 0 hop (direct au retour).
//  - NeighborInfo : lien radio DIRECT (0 hop), émis dans les deux sens.
// On garde le hop MIN par couple orienté (meilleure liaison de la fenêtre).
// PRIVACY : uniquement entre nodes affichables (localisés, non exclus).
const SELECT_REACH = `
  WITH tr_paths AS (
    SELECT
      packet_id, direction,
      (ARRAY[(array_agg(from_node ORDER BY step))[1]] || array_agg(to_node ORDER BY step)) AS path
    FROM traceroute_segments
    WHERE received_at > NOW() - INTERVAL '30 days'
      -- packet_id NULL (ex: traceroute JSON sans id) : NULL est fusionné par
      -- GROUP BY -> concatène des relevés distincts en un chemin fantôme. On
      -- exclut ces segments de la reconstruction d'atteignabilité.
      AND packet_id IS NOT NULL
    -- On groupe aussi par extrémités : deux relevés partageant un packet_id
    -- (collision 32 bits sur 30 j) ne peuvent plus se mélanger.
    GROUP BY packet_id, direction, source_node, target_node
  ),
  edges AS (
    SELECT p.path[i] AS a, p.path[j] AS b, (j - i - 1) AS hop
    FROM tr_paths p,
         LATERAL generate_subscripts(p.path, 1) AS i,
         LATERAL generate_subscripts(p.path, 1) AS j
    WHERE i < j
    UNION ALL
    SELECT node_id, neighbor_id, 0 FROM node_neighbors WHERE received_at > NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT neighbor_id, node_id, 0 FROM node_neighbors WHERE received_at > NOW() - INTERVAL '30 days'
  )
  SELECT
    e.a       AS "fromId",
    e.b       AS "toId",
    MIN(e.hop) AS "hop"
  FROM edges e
  JOIN nodes na ON na.node_id = e.a
  JOIN nodes nb ON nb.node_id = e.b
  WHERE e.a <> e.b
    AND na.last_lat IS NOT NULL AND na.last_lon IS NOT NULL
    AND nb.last_lat IS NOT NULL AND nb.last_lon IS NOT NULL
    AND NOT na.excluded AND NOT nb.excluded
  GROUP BY e.a, e.b
`;

export async function getNodeReach(): Promise<ReachEdge[]> {
  const { rows } = await pool.query<ReachRow>(SELECT_REACH);
  return toReachEdges(rows);
}
