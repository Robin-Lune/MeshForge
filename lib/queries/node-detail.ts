// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { pool } from "../db";
import { haversineKm } from "../geo";
import type {
  NodeHistoryPoint,
  NodeGatewayLink,
  NodeHeardLink,
  NodeDeviceMetrics,
} from "../../types";

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
  gwLat: number | null;
  gwLon: number | null;
}

// Distance node ↔ gateway : calculée seulement si les DEUX positions sont
// connues (le node ou le gateway peuvent ne jamais avoir émis de position).
export function toGatewayLinks(
  rows: GatewayLinkRow[],
  nodeLat: number | null = null,
  nodeLon: number | null = null,
): NodeGatewayLink[] {
  return rows.map((r) => {
    const hasBoth =
      nodeLat != null && nodeLon != null && r.gwLat != null && r.gwLon != null;
    return {
      gatewayId: r.gatewayId,
      gatewayName: r.gatewayName,
      snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
      bestHop: r.bestHop == null ? null : Number(r.bestHop),
      packets: Number(r.packets),
      distanceKm: hasBoth
        ? Math.round(haversineKm(nodeLat, nodeLon, r.gwLat!, r.gwLon!) * 10) / 10
        : null,
    };
  });
}

interface HeardNodeRow {
  nodeId: string;
  nodeName: string | null;
  snr: string | number | null;
  bestHop: string | number | null;
  packets: string | number;
  lastHeard: Date;
  hasPosition: boolean;
}

// Nodes que ce node a entendus (il agit alors en gateway). L'appartenance à la
// liste ne dépend QUE de la réception d'un paquet — un node sans position (qui
// n'a jamais émis de trame position) y figure aussi, d'où hasPosition.
export function toHeardNodes(rows: HeardNodeRow[]): NodeHeardLink[] {
  return rows.map((r) => ({
    nodeId: r.nodeId,
    nodeName: r.nodeName,
    snr: r.snr == null ? null : Math.round(Number(r.snr) * 10) / 10,
    bestHop: r.bestHop == null ? null : Number(r.bestHop),
    packets: Number(r.packets),
    lastHeard: r.lastHeard.toISOString(),
    hasPosition: r.hasPosition,
  }));
}

// pg renvoie REAL en number, mais on coerce par robustesse (string possible).
interface DeviceMetricsRow {
  voltage: string | number | null;
  channelUtil: string | number | null;
  airUtilTx: string | number | null;
}

const round = (v: string | number | null, decimals: number): number | null =>
  v == null ? null : Math.round(Number(v) * 10 ** decimals) / 10 ** decimals;

export function toDeviceMetrics(
  row: DeviceMetricsRow | undefined,
): NodeDeviceMetrics {
  return {
    voltage: round(row?.voltage ?? null, 2),
    channelUtil: round(row?.channelUtil ?? null, 1),
    airUtilTx: round(row?.airUtilTx ?? null, 1),
  };
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
    COUNT(*)                              AS packets,
    gw.last_lat                           AS "gwLat",
    gw.last_lon                           AS "gwLon"
  FROM packets p
  LEFT JOIN nodes gw ON gw.node_id = p.gateway_id
  WHERE p.node_id = $1
    AND p.gateway_id IS NOT NULL
    AND p.gateway_id <> p.node_id
    AND p.received_at > NOW() - INTERVAL '30 days'
  GROUP BY p.gateway_id, gw.long_name, gw.short_name, gw.last_lat, gw.last_lon
  ORDER BY snr DESC NULLS LAST
`;

// nodeLat/nodeLon (position du node sujet) servent à calculer la distance vers
// chaque gateway — passés par l'appelant qui a déjà chargé le node.
export async function getNodeGateways(
  nodeId: string,
  nodeLat: number | null = null,
  nodeLon: number | null = null,
): Promise<NodeGatewayLink[]> {
  const { rows } = await pool.query<GatewayLinkRow>(SELECT_GATEWAYS, [nodeId]);
  return toGatewayLinks(rows, nodeLat, nodeLon);
}

// Miroir de SELECT_GATEWAYS : les nodes que CE node a captés (gateway_id = $1).
// LEFT JOIN nodes -> nom si connu ; aucun filtre sur la position, donc un node
// jamais localisé apparaît quand même (hasPosition = false). SNR/hop moyens et
// meilleur hop vus DE ce node vers chaque émetteur.
const SELECT_HEARD_NODES = `
  SELECT
    p.node_id                             AS "nodeId",
    COALESCE(n.long_name, n.short_name)   AS "nodeName",
    AVG(p.snr)                            AS snr,
    MIN(p.hop_count)                      AS "bestHop",
    COUNT(*)                              AS packets,
    MAX(p.received_at)                    AS "lastHeard",
    (n.last_lat IS NOT NULL AND n.last_lon IS NOT NULL) AS "hasPosition"
  FROM packets p
  LEFT JOIN nodes n ON n.node_id = p.node_id
  WHERE p.gateway_id = $1
    AND p.node_id IS NOT NULL
    AND p.node_id <> p.gateway_id
    AND p.received_at > NOW() - INTERVAL '30 days'
  GROUP BY p.node_id, n.long_name, n.short_name, n.last_lat, n.last_lon
  ORDER BY "lastHeard" DESC
`;

export async function getNodeHeardNodes(
  nodeId: string,
): Promise<NodeHeardLink[]> {
  const { rows } = await pool.query<HeardNodeRow>(SELECT_HEARD_NODES, [nodeId]);
  return toHeardNodes(rows);
}

// Dernière valeur non-nulle de chaque métrique device sur 30j (les métriques
// arrivent dans des trames télémétrie distinctes -> on prend le dernier de
// chaque colonne indépendamment). Déjà capté par le worker, juste pas affiché.
const SELECT_DEVICE_METRICS = `
  SELECT
    (array_agg(voltage      ORDER BY received_at DESC) FILTER (WHERE voltage      IS NOT NULL))[1] AS voltage,
    (array_agg(channel_util ORDER BY received_at DESC) FILTER (WHERE channel_util IS NOT NULL))[1] AS "channelUtil",
    (array_agg(air_util_tx  ORDER BY received_at DESC) FILTER (WHERE air_util_tx  IS NOT NULL))[1] AS "airUtilTx"
  FROM packets
  WHERE node_id = $1 AND received_at > NOW() - INTERVAL '30 days'
`;

export async function getNodeDeviceMetrics(
  nodeId: string,
): Promise<NodeDeviceMetrics> {
  const { rows } = await pool.query<DeviceMetricsRow>(SELECT_DEVICE_METRICS, [
    nodeId,
  ]);
  return toDeviceMetrics(rows[0]);
}
