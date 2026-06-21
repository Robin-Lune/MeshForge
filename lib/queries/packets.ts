import { pool } from "../db";
import type { ParsedPacket, Trame, GatewayStat } from "../../types";

const INSERT_PACKET = `
  INSERT INTO packets (
    gateway_id, node_id, packet_type, channel,
    lat, lon, altitude, rssi, snr, hop_count,
    battery_pct, voltage, channel_util, air_util_tx, raw
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
`;

// received_at n'est pas passé : la colonne prend DEFAULT NOW() (= moment de
// réception côté broker, plus fiable que l'horloge des nodes du mesh).
export async function insertPacket(p: ParsedPacket): Promise<void> {
  await pool.query(INSERT_PACKET, [
    p.gatewayId,
    p.nodeId,
    p.packetType,
    p.channel,
    p.lat,
    p.lon,
    p.altitude,
    p.rssi,
    p.snr,
    p.hopCount,
    p.batteryPct,
    p.voltage,
    p.channelUtil,
    p.airUtilTx,
    JSON.stringify(p.raw),
  ]);
}

// Derniers paquets bruts pour la page debug « Trames » (admin only).
// Privacy OBLIGATOIRE : Fr_EMCOM (urgence) JAMAIS exposé, même en debug — on
// exclut le canal (IS DISTINCT FROM garde les channels NULL). `raw` complet pour
// le diagnostic. Lecture réservée à la page /admin/trames (derrière l'auth).
// gatewayId optionnel : null = tous les gateways. Filtre paramétré ($2) ->
// pas de SQLi même si l'id vient de la query string.
const SELECT_RECENT_PACKETS = `
  SELECT
    received_at AS "receivedAt",
    gateway_id  AS "gatewayId",
    node_id     AS "nodeId",
    packet_type AS "packetType",
    channel,
    rssi,
    snr,
    hop_count   AS "hopCount",
    raw
  FROM packets
  WHERE channel IS DISTINCT FROM 'Fr_EMCOM'
    AND ($2::text IS NULL OR gateway_id = $2)
  ORDER BY received_at DESC
  LIMIT $1
`;

type RecentPacketRow = Omit<Trame, "receivedAt"> & { receivedAt: Date };

export async function getRecentPackets(
  limit = 200,
  gatewayId: string | null = null,
): Promise<Trame[]> {
  const { rows } = await pool.query<RecentPacketRow>(SELECT_RECENT_PACKETS, [
    limit,
    gatewayId,
  ]);
  return rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() }));
}

// Aperçu par gateway (vue par défaut des Trames) : charge & portée de chaque
// relais. Fr_EMCOM exclu (cohérent avec le flux brut).
interface GatewayStatRow {
  gatewayId: string;
  name: string | null;
  packets24h: string | number;
  nodes24h: string | number;
  lastSeen: Date | null;
}

// Normalise une ligne d'agrégat (COUNT bigint -> number, date -> ISO). Pure, testée.
export function toGatewayStat(row: GatewayStatRow): GatewayStat {
  return {
    gatewayId: row.gatewayId,
    name: row.name,
    packets24h: Number(row.packets24h),
    nodes24h: Number(row.nodes24h),
    lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
  };
}

const SELECT_GATEWAY_OVERVIEW = `
  SELECT
    p.gateway_id AS "gatewayId",
    n.long_name  AS "name",
    COUNT(*) FILTER (WHERE p.received_at > NOW() - INTERVAL '24 hours')              AS "packets24h",
    COUNT(DISTINCT p.node_id) FILTER (WHERE p.received_at > NOW() - INTERVAL '24 hours') AS "nodes24h",
    MAX(p.received_at)                                                              AS "lastSeen"
  FROM packets p
  LEFT JOIN nodes n ON n.node_id = p.gateway_id
  WHERE p.gateway_id IS NOT NULL
    AND p.channel IS DISTINCT FROM 'Fr_EMCOM'
  GROUP BY p.gateway_id, n.long_name
  ORDER BY "packets24h" DESC, "lastSeen" DESC NULLS LAST
`;

export async function getGatewayOverview(): Promise<GatewayStat[]> {
  const { rows } = await pool.query<GatewayStatRow>(SELECT_GATEWAY_OVERVIEW);
  return rows.map(toGatewayStat);
}
