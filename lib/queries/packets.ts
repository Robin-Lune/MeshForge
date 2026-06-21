import { pool } from "../db";
import type { ParsedPacket, Trame } from "../../types";

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
  ORDER BY received_at DESC
  LIMIT $1
`;

type RecentPacketRow = Omit<Trame, "receivedAt"> & { receivedAt: Date };

export async function getRecentPackets(limit = 200): Promise<Trame[]> {
  const { rows } = await pool.query<RecentPacketRow>(SELECT_RECENT_PACKETS, [
    limit,
  ]);
  return rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() }));
}
