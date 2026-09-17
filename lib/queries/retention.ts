// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import { retentionPolicyNeedsUpdate } from "../retention";

// Rétention pilotée par `settings.retention_days` (cf. lib/queries/settings.ts) :
//  - `packets` (hypertable) : politique TimescaleDB, réalignée si elle diffère ;
//  - `node_neighbors`, `traceroute_segments` (tables simples) : DELETE ;
//  - `nodes` muets (aucun signe de vie depuis N jours) : supprimés, SAUF ceux qui
//    portent une marque RGPD (excluded / anonymized) — la marque doit survivre au
//    retour du node, on efface seulement position et batterie.
// Appelée par le worker (toutes les heures) et par /admin/config à l'enregistrement.

const CUTOFF = `NOW() - make_interval(days => $1)`;

export const PURGE_NODE_NEIGHBORS = `
  DELETE FROM node_neighbors WHERE received_at < ${CUTOFF}
`;

export const PURGE_TRACEROUTE_SEGMENTS = `
  DELETE FROM traceroute_segments WHERE received_at < ${CUTOFF}
`;

export const SCRUB_SILENT_NODES = `
  UPDATE nodes
  SET last_lat = NULL, last_lon = NULL, last_battery = NULL
  WHERE COALESCE(last_seen, first_seen) < ${CUTOFF}
    AND (excluded OR anonymized)
    AND (last_lat IS NOT NULL OR last_lon IS NOT NULL OR last_battery IS NOT NULL)
`;

export const DELETE_SILENT_NODES = `
  DELETE FROM nodes
  WHERE COALESCE(last_seen, first_seen) < ${CUTOFF}
    AND NOT excluded AND NOT anonymized
`;

// Politique de `packets`. TimescaleDB supprime par chunk (7 jours par défaut) :
// une ligne peut donc survivre jusqu'à N + 7 jours.
const SELECT_PACKETS_DROP_AFTER = `
  SELECT config->>'drop_after' AS "dropAfter"
  FROM timescaledb_information.jobs
  WHERE proc_name = 'policy_retention' AND hypertable_name = 'packets'
  LIMIT 1
`;
const REMOVE_PACKETS_POLICY = `SELECT remove_retention_policy('packets', if_exists => TRUE)`;
const ADD_PACKETS_POLICY = `
  SELECT add_retention_policy('packets', drop_after => make_interval(days => $1), if_not_exists => TRUE)
`;

export interface PurgeResult {
  neighbors: number;
  traceroutes: number;
  nodesScrubbed: number;
  nodesDeleted: number;
}

// Vrai si la politique a été (re)créée.
export async function applyPacketsRetentionPolicy(days: number): Promise<boolean> {
  const { rows } = await pool.query<{ dropAfter: string | null }>(SELECT_PACKETS_DROP_AFTER);
  if (!retentionPolicyNeedsUpdate(rows[0]?.dropAfter ?? null, days)) return false;
  await pool.query(REMOVE_PACKETS_POLICY);
  await pool.query(ADD_PACKETS_POLICY, [days]);
  return true;
}

// Purge des tables simples et des nodes muets, dans UNE transaction.
export async function purgeExpired(days: number): Promise<PurgeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const neighbors = await client.query(PURGE_NODE_NEIGHBORS, [days]);
    const traceroutes = await client.query(PURGE_TRACEROUTE_SEGMENTS, [days]);
    const scrubbed = await client.query(SCRUB_SILENT_NODES, [days]);
    const deleted = await client.query(DELETE_SILENT_NODES, [days]);
    await client.query("COMMIT");
    return {
      neighbors: neighbors.rowCount ?? 0,
      traceroutes: traceroutes.rowCount ?? 0,
      nodesScrubbed: scrubbed.rowCount ?? 0,
      nodesDeleted: deleted.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Purge d'abord (fonctionne sur tout Postgres), politique ensuite (TimescaleDB).
export async function applyRetention(
  days: number,
): Promise<PurgeResult & { policyUpdated: boolean }> {
  const purge = await purgeExpired(days);
  const policyUpdated = await applyPacketsRetentionPolicy(days);
  return { ...purge, policyUpdated };
}
