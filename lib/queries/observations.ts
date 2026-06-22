// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type { Observation } from "../../types";

// pg : MIN(hop_count) (smallint) en number/string, AVG(snr)::real en number.
interface ObservationRow {
  gatewayId: string;
  nodeId: string;
  bestHop: string | number | null;
  snr: number | null;
}

// Normalise les arêtes (coercition bestHop ; snr/bestHop null préservés).
export function toObservations(rows: ObservationRow[]): Observation[] {
  return rows.map((r) => ({
    gatewayId: r.gatewayId,
    nodeId: r.nodeId,
    bestHop: r.bestHop == null ? null : Number(r.bestHop),
    snr: r.snr,
  }));
}

// "Qui a entendu qui" : par (gateway, node), le hop MINIMAL (0 = lien radio direct
// réel, exploitable pour la portée) et le SNR moyen.
// PRIVACY : uniquement entre nodes affichables (localisés, non exclus). Les mobiles
// sont INCLUS — leur position snappée (~500 m, cf. getPublicNodes) alimente le tracé.
// Découplage is_mobile/toile : is_mobile = TRUE est désormais le défaut prudent
// (flou position), il ne doit donc plus vider la toile des nouveaux nodes.
const SELECT_OBSERVATIONS = `
  SELECT
    p.gateway_id      AS "gatewayId",
    p.node_id         AS "nodeId",
    MIN(p.hop_count)  AS "bestHop",
    AVG(p.snr)::real  AS "snr"
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
`;

export async function getObservations(): Promise<Observation[]> {
  const { rows } = await pool.query<ObservationRow>(SELECT_OBSERVATIONS);
  return toObservations(rows);
}
