import { pool } from "../db";
import type { ParsedPacket } from "../../types";

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
