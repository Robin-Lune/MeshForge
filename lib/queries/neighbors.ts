// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import { snapToGrid } from "../privacy";
import type { NeighborReport, NodeNeighbor } from "../../types";

const INSERT_NEIGHBOR = `
  INSERT INTO node_neighbors (node_id, neighbor_id, snr, gateway_id, channel)
  VALUES ($1, $2, $3, $4, $5)
`;

// Enregistre les voisins directs déclarés par un node (paquet NeighborInfo).
// Insertion atomique : tous les voisins d'un même paquet dans une transaction
// (pas de liste tronquée si un INSERT échoue, received_at homogène).
export async function insertNodeNeighbors(
  nodeId: string,
  neighbors: NeighborReport[],
  gatewayId: string | null,
  channel: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const n of neighbors) {
      await client.query(INSERT_NEIGHBOR, [nodeId, n.neighborId, n.snr, gatewayId, channel]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// pg : AVG(snr) en number|string, date -> Date.
interface NeighborRow {
  nodeId: string;
  name: string | null;
  snr: string | number | null;
  lat: number | null;
  lon: number | null;
  isMobile: boolean | null; // TRUE/NULL (défaut prudent) -> position floutée
  lastSeen: Date | null;
}

// PRIVACY : un voisin mobile (is_mobile != FALSE) voit sa position snappée
// (~1,5 km), comme sur la carte publique ; seul un relais fixe assumé est exact.
export function toNodeNeighbors(rows: NeighborRow[]): NodeNeighbor[] {
  return rows.map((r) => {
    const located = r.lat != null && r.lon != null;
    const pos =
      located && r.isMobile !== false ? snapToGrid(r.lat!, r.lon!) : { lat: r.lat, lon: r.lon };
    return {
      nodeId: r.nodeId,
      name: r.name,
      snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
      lat: pos.lat,
      lon: pos.lon,
      lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
    };
  });
}

// Voisins directs d'un node sur 30 j : dernier SNR moyen + position (pour la
// mini-carte). LEFT JOIN nodes -> nom + position ; un voisin sans position
// (jamais localisé) sort quand même (lat/lon null -> non tracé côté carte).
// PRIVACY : les voisins exclus (opt-out) sont retirés.
const SELECT_NEIGHBORS = `
  SELECT
    nn.neighbor_id                        AS "nodeId",
    COALESCE(n.long_name, n.short_name)   AS "name",
    AVG(nn.snr)                           AS "snr",
    n.last_lat                            AS "lat",
    n.last_lon                            AS "lon",
    n.is_mobile                           AS "isMobile",
    MAX(nn.received_at)                   AS "lastSeen"
  FROM node_neighbors nn
  LEFT JOIN nodes n ON n.node_id = nn.neighbor_id
  WHERE nn.node_id = $1
    AND nn.received_at > NOW() - INTERVAL '30 days'
    AND (n.node_id IS NULL OR NOT n.excluded)
  GROUP BY nn.neighbor_id, n.long_name, n.short_name, n.last_lat, n.last_lon, n.is_mobile
  ORDER BY "lastSeen" DESC
`;

export async function getNodeNeighbors(nodeId: string): Promise<NodeNeighbor[]> {
  const { rows } = await pool.query<NeighborRow>(SELECT_NEIGHBORS, [nodeId]);
  return toNodeNeighbors(rows);
}
