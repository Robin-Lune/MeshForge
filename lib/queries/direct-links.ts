// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type { DirectLink } from "../../types";

// pg : percentile_cont (médiane) en number|string, COUNT (bigint) en string.
interface DirectLinkRow {
  aId: string;
  bId: string;
  snr: string | number | null;
  rssi: string | number | null;
  packets: string | number;
}

// Normalise les liens directs (snr arrondi 0,1 dB, rssi arrondi entier, packets number).
export function toDirectLinks(rows: DirectLinkRow[]): DirectLink[] {
  return rows.map((r) => ({
    aId: r.aId,
    bId: r.bId,
    snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
    rssi: r.rssi == null ? null : Math.round(Number(r.rssi)),
    packets: Number(r.packets),
  }));
}

// Liens radio DIRECTS (hop_count = 0) sur les X dernières heures, agrégés par
// PAIRE non-orientée (LEAST/GREATEST) : médiane du SNR (robuste aux paquets
// aberrants) et nombre de paquets RÉELS (arêtes synthétiques NeighborInfo/
// Traceroute exclues du compteur mais incluses pour révéler le lien + son SNR).
// PRIVACY : uniquement entre nodes affichables (localisés, non exclus), comme
// getObservations. Fenêtre paramétrée ($1 heures) -> pas de SQLi.
const SELECT_DIRECT_LINKS = `
  WITH direct AS (
    SELECT
      LEAST(gateway_id, node_id)    AS a_id,
      GREATEST(gateway_id, node_id) AS b_id,
      snr,
      rssi,
      packet_type
    FROM packets
    WHERE hop_count = 0
      AND gateway_id IS NOT NULL AND node_id IS NOT NULL
      AND gateway_id <> node_id
      AND received_at > NOW() - ($1::int * INTERVAL '1 hour')
  )
  SELECT
    d.a_id AS "aId",
    d.b_id AS "bId",
    percentile_cont(0.5) WITHIN GROUP (ORDER BY d.snr)  AS snr,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY d.rssi) AS rssi,
    COUNT(*) FILTER (
      WHERE d.packet_type IS DISTINCT FROM 'neighbor'
        AND d.packet_type IS DISTINCT FROM 'traceroute_hop'
    ) AS packets
  FROM direct d
  JOIN nodes na ON na.node_id = d.a_id
  JOIN nodes nb ON nb.node_id = d.b_id
  WHERE na.last_lat IS NOT NULL AND na.last_lon IS NOT NULL
    AND nb.last_lat IS NOT NULL AND nb.last_lon IS NOT NULL
    AND NOT na.excluded AND NOT nb.excluded
  GROUP BY d.a_id, d.b_id
`;

export async function getDirectLinks(sinceHours: number): Promise<DirectLink[]> {
  const { rows } = await pool.query<DirectLinkRow>(SELECT_DIRECT_LINKS, [sinceHours]);
  return toDirectLinks(rows);
}
