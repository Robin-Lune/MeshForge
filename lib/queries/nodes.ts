import { pool } from "../db";
import type { ParsedPacket } from "../../types";

// Upsert du dernier état connu d'un node, à chaque paquet reçu.
// COALESCE partout : un paquet sans position/batterie/nom ne doit jamais
// écraser une valeur déjà connue. Les champs nodeinfo (long_name, hw_model...)
// arrivent à null sur les autres types de paquets -> COALESCE les préserve.
const UPSERT_NODE = `
  INSERT INTO nodes (
    node_id, long_name, short_name, hw_model, firmware, role,
    last_lat, last_lon, last_battery, last_seen
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
  ON CONFLICT (node_id) DO UPDATE SET
    long_name    = COALESCE(EXCLUDED.long_name,    nodes.long_name),
    short_name   = COALESCE(EXCLUDED.short_name,   nodes.short_name),
    hw_model     = COALESCE(EXCLUDED.hw_model,     nodes.hw_model),
    firmware     = COALESCE(EXCLUDED.firmware,     nodes.firmware),
    role         = COALESCE(EXCLUDED.role,         nodes.role),
    last_lat     = COALESCE(EXCLUDED.last_lat,     nodes.last_lat),
    last_lon     = COALESCE(EXCLUDED.last_lon,     nodes.last_lon),
    last_battery = COALESCE(EXCLUDED.last_battery, nodes.last_battery),
    last_seen    = EXCLUDED.last_seen
`;

export async function upsertNode(p: ParsedPacket): Promise<void> {
  await pool.query(UPSERT_NODE, [
    p.nodeId,
    p.longName,
    p.shortName,
    p.hwModel,
    p.firmware,
    p.role,
    p.lat,
    p.lon,
    p.batteryPct,
  ]);
}
