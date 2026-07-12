// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type { Observation } from "../../types";

// pg : MIN(hop_count) (smallint) en number/string, AVG(snr)::real en number,
// COUNT(*) (bigint) en string.
interface ObservationRow {
  gatewayId: string;
  nodeId: string;
  bestHop: string | number | null;
  snr: number | null;
  packets: string | number;
  source?: string;
}

// Normalise les arêtes (coercition bestHop/packets ; snr/bestHop null préservés).
export function toObservations(rows: ObservationRow[]): Observation[] {
  return rows.map((r) => ({
    gatewayId: r.gatewayId,
    nodeId: r.nodeId,
    bestHop: r.bestHop == null ? null : Number(r.bestHop),
    snr: r.snr,
    packets: Number(r.packets),
    source:
      r.source === "neighbor" || r.source === "traceroute"
        ? r.source
        : "gateway",
  }));
}

// Toile de liaisons, trois sources d'arêtes UNIONnées (même fenêtre 7 jours,
// mêmes barrières privacy : extrémités localisées et non exclues) :
// 1. source='gateway' : "qui a entendu qui" — par (gateway, node), le hop
//    MINIMAL (0 = lien radio direct réel, exploitable pour la portée) et le
//    SNR moyen (table packets).
// 2. source='neighbor' : liens directs déclarés par les paquets NeighborInfo
//    (table node_neighbors). Paire canonique LEAST/GREATEST : les déclarations
//    des deux voisins fusionnent en UNE arête.
// 3. source='traceroute' : chaque saut observé d'un traceroute est un lien
//    radio direct (table traceroute_segments), même canonicalisation.
// packets = 0 pour neighbor/traceroute : le badge « paquets échangés » du
// survol n'a pas de sens pour un lien déclaré (il resterait trompeur).
// PRIVACY : uniquement entre nodes affichables (localisés, non exclus). Les mobiles
// sont INCLUS — leur position snappée (~500 m, cf. getPublicNodes) alimente le tracé.
// Découplage is_mobile/toile : is_mobile = TRUE est désormais le défaut prudent
// (flou position), il ne doit donc plus vider la toile des nouveaux nodes.
const SELECT_OBSERVATIONS = `
  SELECT
    p.gateway_id      AS "gatewayId",
    p.node_id         AS "nodeId",
    MIN(p.hop_count)  AS "bestHop",
    AVG(p.snr)::real  AS "snr",
    COUNT(*)          AS "packets",
    'gateway'         AS "source"
  FROM packets p
  JOIN nodes gw ON gw.node_id = p.gateway_id
  JOIN nodes nd ON nd.node_id = p.node_id
  WHERE p.gateway_id IS NOT NULL AND p.node_id IS NOT NULL
    AND p.gateway_id <> p.node_id
    AND gw.last_lat IS NOT NULL AND gw.last_lon IS NOT NULL
    AND nd.last_lat IS NOT NULL AND nd.last_lon IS NOT NULL
    AND NOT gw.excluded AND NOT nd.excluded            -- opt-out RGPD
    AND p.received_at > NOW() - INTERVAL '7 days'
  GROUP BY p.gateway_id, p.node_id

  UNION ALL

  SELECT
    LEAST(nn.node_id, nn.neighbor_id)    AS "gatewayId",
    GREATEST(nn.node_id, nn.neighbor_id) AS "nodeId",
    0                                    AS "bestHop",
    AVG(nn.snr)::real                    AS "snr",
    0                                    AS "packets",
    'neighbor'                           AS "source"
  FROM node_neighbors nn
  JOIN nodes na ON na.node_id = LEAST(nn.node_id, nn.neighbor_id)
  JOIN nodes nb ON nb.node_id = GREATEST(nn.node_id, nn.neighbor_id)
  WHERE nn.node_id <> nn.neighbor_id
    AND na.last_lat IS NOT NULL AND na.last_lon IS NOT NULL
    AND nb.last_lat IS NOT NULL AND nb.last_lon IS NOT NULL
    AND NOT na.excluded AND NOT nb.excluded            -- opt-out RGPD
    AND nn.received_at > NOW() - INTERVAL '7 days'
  GROUP BY 1, 2

  UNION ALL

  SELECT
    LEAST(ts.from_node, ts.to_node)    AS "gatewayId",
    GREATEST(ts.from_node, ts.to_node) AS "nodeId",
    0                                  AS "bestHop",
    AVG(ts.snr)::real                  AS "snr",
    0                                  AS "packets",
    'traceroute'                       AS "source"
  FROM traceroute_segments ts
  JOIN nodes na ON na.node_id = LEAST(ts.from_node, ts.to_node)
  JOIN nodes nb ON nb.node_id = GREATEST(ts.from_node, ts.to_node)
  WHERE ts.from_node <> ts.to_node
    AND na.last_lat IS NOT NULL AND na.last_lon IS NOT NULL
    AND nb.last_lat IS NOT NULL AND nb.last_lon IS NOT NULL
    AND NOT na.excluded AND NOT nb.excluded            -- opt-out RGPD
    AND ts.received_at > NOW() - INTERVAL '7 days'
    -- Uniquement des sauts PROUVÉS : le parser ferme le chemin retour d'une
    -- réponse sur le demandeur (traceroute.ts) ; si la réponse est captée en
    -- vol, ce dernier saut est anticipé, pas observé. On l'écarte — pour un
    -- retour symétrique la paire est de toute façon prouvée par l'aller.
    AND NOT (ts.direction = 'back' AND ts.to_node = ts.source_node)
  GROUP BY 1, 2
`;

export async function getObservations(): Promise<Observation[]> {
  const { rows } = await pool.query<ObservationRow>(SELECT_OBSERVATIONS);
  return toObservations(rows);
}
