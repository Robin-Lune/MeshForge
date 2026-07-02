// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type { TraceroutePath } from "../../types";

interface TraceroutePathRow {
  aId: string;
  bId: string;
  hops: string | number | null;
}

// Normalise (hops en number, null préservé).
export function toTraceroutePaths(rows: TraceroutePathRow[]): TraceroutePath[] {
  return rows.map((r) => ({
    aId: r.aId,
    bId: r.bId,
    hops: r.hops == null ? null : Number(r.hops),
  }));
}

const INSERT_PATH = `
  INSERT INTO traceroute_paths (a_id, b_id, hops)
  VALUES (LEAST($1, $2), GREATEST($1, $2), $3)
`;

// Enregistre un trajet logique A↔D (paire normalisée à l'insertion).
export async function insertTraceroutePath(
  aId: string,
  bId: string,
  hops: number,
): Promise<void> {
  await pool.query(INSERT_PATH, [aId, bId, hops]);
}

// Trajets logiques (A↔D) des X dernières heures, par paire (sauts minimum).
// PRIVACY : uniquement entre nodes affichables (localisés, non exclus).
const SELECT_PATHS = `
  SELECT
    tp.a_id        AS "aId",
    tp.b_id        AS "bId",
    MIN(tp.hops)   AS "hops"
  FROM traceroute_paths tp
  JOIN nodes na ON na.node_id = tp.a_id
  JOIN nodes nb ON nb.node_id = tp.b_id
  WHERE na.last_lat IS NOT NULL AND na.last_lon IS NOT NULL
    AND nb.last_lat IS NOT NULL AND nb.last_lon IS NOT NULL
    AND NOT na.excluded AND NOT nb.excluded
    AND tp.received_at > NOW() - ($1::int * INTERVAL '1 hour')
  GROUP BY tp.a_id, tp.b_id
`;

export async function getTraceroutePaths(
  sinceHours = 168,
): Promise<TraceroutePath[]> {
  const { rows } = await pool.query<TraceroutePathRow>(SELECT_PATHS, [sinceHours]);
  return toTraceroutePaths(rows);
}
