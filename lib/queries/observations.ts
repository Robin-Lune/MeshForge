// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type {
  GatewayActivity,
  Observation,
  ObservationsResponse,
} from "../../types";

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

interface GatewayActivityRow {
  gatewayId: string;
  directNodes1h: string | number;
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

export function toGatewayActivity(
  rows: GatewayActivityRow[],
): GatewayActivity[] {
  return rows.map((r) => ({
    gatewayId: r.gatewayId,
    directNodes1h: Number(r.directNodes1h),
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

// Compteur des passerelles. Requête SÉPARÉE de la toile, et c'est le
// point : une arête n'existe que si ses deux extrémités sont affichables, une
// barrière posée pour tracer des liens. Le compteur, lui, n'a besoin d'aucune
// position — la lui appliquer le priverait justement des nodes que la carte ne
// montre jamais (sans GPS, retirés), qui sont sa seule raison d'être.
//
// Régime « agrégat » de docs/analytics.md : la sortie est (id de passerelle,
// nombre). L'identifiant de passerelle est déjà public, aucun node capté n'est
// nommé, donc rien ne permet d'isoler un node — aucune barrière individuelle.
// La passerelle doit rester localisée : sans marker, pas de capsule à porter.
//
// hop_count = 0 STRICTEMENT : au-delà le paquet est arrivé relayé, la passerelle
// ne l'a pas capté. hop_count NULL (hops_away absent du fil) est écarté par la
// comparaison — un hop inconnu ne doit pas être compté comme direct.
const SELECT_GATEWAY_ACTIVITY = `
  SELECT
    p.gateway_id                 AS "gatewayId",
    COUNT(DISTINCT p.node_id)    AS "directNodes1h"
  FROM packets p
  JOIN nodes gw ON gw.node_id = p.gateway_id
  -- La jointure garantit déjà gateway_id NOT NULL ; COUNT(DISTINCT) ignore les
  -- node_id nuls. Seule l'auto-écoute reste à écarter.
  WHERE p.gateway_id <> p.node_id
    AND gw.last_lat IS NOT NULL AND gw.last_lon IS NOT NULL
    AND NOT gw.excluded
    AND p.hop_count = 0
    AND p.received_at > NOW() - INTERVAL '1 hour'
  GROUP BY p.gateway_id
`;

// allSettled et non all : le compteur est un agrément, la toile porte les liens,
// l'anneau « pont » et le filtre par hops. Une dégradation du premier ne doit pas
// emporter le second.
export async function getObservations(): Promise<ObservationsResponse> {
  const [edges, activity] = await Promise.allSettled([
    pool.query<ObservationRow>(SELECT_OBSERVATIONS),
    pool.query<GatewayActivityRow>(SELECT_GATEWAY_ACTIVITY),
  ]);
  if (edges.status === "rejected") throw edges.reason;
  return {
    edges: toObservations(edges.value.rows),
    gatewayActivity:
      activity.status === "fulfilled"
        ? toGatewayActivity(activity.value.rows)
        : [],
  };
}
