// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";

// Un canal retiré de `settings.public_channels` n'est plus ingéré, mais ses
// données déjà stockées restent jusqu'à la purge de rétention. Cette purge,
// déclenchée EXPLICITEMENT par un admin (/admin/config), supprime paquets,
// voisinages et traceroutes des canaux hors liste, puis recalcule la position
// des nodes concernés : `nodes` n'a pas de provenance, on repère donc les nodes
// positionnés par ces paquets AVANT la suppression. Un canal NULL (provenance
// inconnue) n'est jamais touché. Aucun nom de canal n'est codé en dur.

const OFF_ALLOWLIST = `channel IS NOT NULL AND NOT (channel = ANY($1::text[]))`;

export const COUNT_PACKETS_OFF_ALLOWLIST = `
  SELECT COUNT(*)::int AS count FROM packets WHERE ${OFF_ALLOWLIST}
`;

export const SELECT_NODES_POSITIONED_OFF_ALLOWLIST = `
  SELECT DISTINCT node_id AS "nodeId" FROM packets
  WHERE ${OFF_ALLOWLIST} AND lat IS NOT NULL AND lon IS NOT NULL
`;

export const PURGE_PACKETS_OFF_ALLOWLIST = `DELETE FROM packets WHERE ${OFF_ALLOWLIST}`;
export const PURGE_NEIGHBORS_OFF_ALLOWLIST = `DELETE FROM node_neighbors WHERE ${OFF_ALLOWLIST}`;
export const PURGE_SEGMENTS_OFF_ALLOWLIST = `DELETE FROM traceroute_segments WHERE ${OFF_ALLOWLIST}`;

// Dernier paquet valide restant (mêmes bornes que le worker), sinon NULL.
export const REPAIR_POSITIONS_AFTER_PURGE = `
  UPDATE nodes n
  SET last_lat = v.lat, last_lon = v.lon
  FROM (
    SELECT ids.node_id, p.lat, p.lon
    FROM unnest($1::text[]) AS ids(node_id)
    LEFT JOIN LATERAL (
      SELECT lat, lon FROM packets p
      WHERE p.node_id = ids.node_id
        AND p.lat IS NOT NULL AND p.lon IS NOT NULL
        AND NOT (p.lat = 0 AND p.lon = 0)
        AND p.lat BETWEEN -90 AND 90 AND p.lon BETWEEN -180 AND 180
      ORDER BY p.received_at DESC
      LIMIT 1
    ) p ON TRUE
  ) v
  WHERE n.node_id = v.node_id
`;

export interface ChannelPurgeResult {
  packets: number;
  neighbors: number;
  segments: number;
  nodesRepositioned: number;
}

export async function countPacketsOffAllowlist(allowlist: string[]): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(COUNT_PACKETS_OFF_ALLOWLIST, [allowlist]);
  return rows[0]?.count ?? 0;
}

export async function purgeChannelsOffAllowlist(
  allowlist: string[],
): Promise<ChannelPurgeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const affected = await client.query<{ nodeId: string }>(
      SELECT_NODES_POSITIONED_OFF_ALLOWLIST,
      [allowlist],
    );
    const ids = affected.rows.map((r) => r.nodeId);
    const packets = await client.query(PURGE_PACKETS_OFF_ALLOWLIST, [allowlist]);
    const neighbors = await client.query(PURGE_NEIGHBORS_OFF_ALLOWLIST, [allowlist]);
    const segments = await client.query(PURGE_SEGMENTS_OFF_ALLOWLIST, [allowlist]);
    const repaired = ids.length
      ? await client.query(REPAIR_POSITIONS_AFTER_PURGE, [ids])
      : { rowCount: 0 };
    await client.query("COMMIT");
    return {
      packets: packets.rowCount ?? 0,
      neighbors: neighbors.rowCount ?? 0,
      segments: segments.rowCount ?? 0,
      nodesRepositioned: repaired.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
