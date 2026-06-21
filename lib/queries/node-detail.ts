import { pool } from "../db";
import type { NodeHistoryPoint, NodeGatewayLink } from "../../types";

// pg : date_trunc → Date ; AVG → numeric/double (string|number) ; COUNT → bigint string.
interface HistoryRow {
  day: Date;
  snr: string | number | null;
  battery: string | number | null;
  packets: string | number;
}

export function toHistoryPoints(rows: HistoryRow[]): NodeHistoryPoint[] {
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
    battery: r.battery == null ? null : Math.round(Number(r.battery)),
    packets: Number(r.packets),
  }));
}

interface GatewayLinkRow {
  gatewayId: string;
  gatewayName: string | null;
  snr: string | number | null;
  bestHop: string | number | null;
  packets: string | number;
}

export function toGatewayLinks(rows: GatewayLinkRow[]): NodeGatewayLink[] {
  return rows.map((r) => ({
    gatewayId: r.gatewayId,
    gatewayName: r.gatewayName,
    snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
    bestHop: r.bestHop == null ? null : Number(r.bestHop),
    packets: Number(r.packets),
  }));
}

// Série journalière sur 30j : SNR moyen, batterie moyenne, nb de paquets / jour.
const SELECT_HISTORY = `
  SELECT
    date_trunc('day', received_at) AS day,
    AVG(snr)                       AS snr,
    AVG(battery_pct)               AS battery,
    COUNT(*)                       AS packets
  FROM packets
  WHERE node_id = $1 AND received_at > NOW() - INTERVAL '30 days'
  GROUP BY 1
  ORDER BY 1
`;

export async function getNodeHistory(nodeId: string): Promise<NodeHistoryPoint[]> {
  const { rows } = await pool.query<HistoryRow>(SELECT_HISTORY, [nodeId]);
  return toHistoryPoints(rows);
}

// Gateways qui ont entendu ce node (multi-SNR pour un nœud-pont) : SNR moyen et
// meilleur hop par gateway. LEFT JOIN nodes pour le nom du gateway.
const SELECT_GATEWAYS = `
  SELECT
    p.gateway_id                          AS "gatewayId",
    COALESCE(gw.long_name, gw.short_name) AS "gatewayName",
    AVG(p.snr)                            AS snr,
    MIN(p.hop_count)                      AS "bestHop",
    COUNT(*)                              AS packets
  FROM packets p
  LEFT JOIN nodes gw ON gw.node_id = p.gateway_id
  WHERE p.node_id = $1
    AND p.gateway_id IS NOT NULL
    AND p.gateway_id <> p.node_id
    AND p.received_at > NOW() - INTERVAL '30 days'
  GROUP BY p.gateway_id, gw.long_name, gw.short_name
  ORDER BY snr DESC NULLS LAST
`;

export async function getNodeGateways(nodeId: string): Promise<NodeGatewayLink[]> {
  const { rows } = await pool.query<GatewayLinkRow>(SELECT_GATEWAYS, [nodeId]);
  return toGatewayLinks(rows);
}
