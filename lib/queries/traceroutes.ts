// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import type {
  NodeTraceroute,
  RawMeshtasticPacket,
  TracerouteInfo,
} from "../../types";

const INSERT_SEGMENT = `
  INSERT INTO traceroute_segments (
    packet_id, channel, source_node, target_node, gateway_id,
    direction, step, from_node, to_node, snr, raw
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
`;

// Enregistre chaque saut d'un traceroute (aller + retour) -> reconstruction fine.
// Tous les segments d'un même traceroute sont insérés dans UNE transaction :
//  - atomicité (pas de trajet tronqué si un INSERT échoue) ;
//  - received_at (DEFAULT NOW() = transaction_timestamp()) IDENTIQUE pour tous
//    les segments, sinon le regroupement par instant (toNodeTraceroutes) peut
//    fragmenter un même relevé si les INSERT chevauchent une bordure de ms.
export async function insertTracerouteSegments(
  info: TracerouteInfo,
  gatewayId: string | null,
  channel: string,
  raw: RawMeshtasticPacket,
): Promise<void> {
  const rawJson = JSON.stringify(raw);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of info.segments) {
      await client.query(INSERT_SEGMENT, [
        info.packetId,
        channel,
        info.sourceNode,
        info.targetNode,
        gatewayId,
        s.direction,
        s.step,
        s.fromNode,
        s.toNode,
        s.snr,
        rawJson,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface SegmentRow {
  packetId: number | null;
  sourceNode: string;
  targetNode: string;
  receivedAt: Date;
  direction: "forward" | "back";
  step: string | number;
  fromNode: string;
  fromName: string | null;
  toNode: string;
  toName: string | null;
  snr: string | number | null;
}

// Regroupe les segments par traceroute (packet_id + extrémités + instant) et
// construit chaque trajet, avec le nœud « en face » du node consulté.
export function toNodeTraceroutes(
  rows: SegmentRow[],
  nodeId: string,
): NodeTraceroute[] {
  const byKey = new Map<string, NodeTraceroute>();
  for (const r of rows) {
    const iso = r.receivedAt.toISOString();
    const key = `${r.packetId}|${r.sourceNode}|${r.targetNode}|${iso}`;
    let t = byKey.get(key);
    if (!t) {
      t = {
        sourceNode: r.sourceNode,
        targetNode: r.targetNode,
        otherNode: r.sourceNode === nodeId ? r.targetNode : r.sourceNode,
        receivedAt: iso,
        hops: [],
      };
      byKey.set(key, t);
    }
    t.hops.push({
      direction: r.direction,
      step: Number(r.step),
      fromNode: r.fromNode,
      fromName: r.fromName,
      toNode: r.toNode,
      toName: r.toName,
      snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
    });
  }
  return [...byKey.values()];
}

// Traceroutes des 30 derniers jours impliquant ce node (origine ou destination).
// Segments ordonnés (récents d'abord, puis aller/retour, puis étape).
const SELECT_TRACEROUTES = `
  SELECT
    ts.packet_id                          AS "packetId",
    ts.source_node                        AS "sourceNode",
    ts.target_node                        AS "targetNode",
    ts.received_at                        AS "receivedAt",
    ts.direction, ts.step,
    ts.from_node                          AS "fromNode",
    COALESCE(fn.long_name, fn.short_name) AS "fromName",
    ts.to_node                            AS "toNode",
    COALESCE(tn.long_name, tn.short_name) AS "toName",
    ts.snr
  FROM traceroute_segments ts
  LEFT JOIN nodes fn ON fn.node_id = ts.from_node
  LEFT JOIN nodes tn ON tn.node_id = ts.to_node
  WHERE (ts.source_node = $1 OR ts.target_node = $1)
    AND ts.received_at > NOW() - INTERVAL '30 days'
  ORDER BY ts.received_at DESC, ts.direction, ts.step
`;

export async function getNodeTraceroutes(nodeId: string): Promise<NodeTraceroute[]> {
  const { rows } = await pool.query<SegmentRow>(SELECT_TRACEROUTES, [nodeId]);
  return toNodeTraceroutes(rows, nodeId);
}
