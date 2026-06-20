import { pool } from "../db";
import { isPubliclyVisible } from "../privacy";
import type { ParsedPacket, PublicNode, NodeUpdate } from "../../types";

// Upsert du dernier état connu d'un node, à chaque paquet reçu.
// COALESCE partout : un paquet sans position/batterie/nom ne doit jamais
// écraser une valeur déjà connue. Les champs nodeinfo (long_name, hw_model...)
// arrivent à null sur les autres types de paquets -> COALESCE les préserve.
// RETURNING : on récupère l'état FUSIONNÉ pour décider du pg_notify temps réel.
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
  RETURNING
    node_id      AS "nodeId",
    long_name    AS "longName",
    short_name   AS "shortName",
    last_lat     AS "lat",
    last_lon     AS "lon",
    last_battery AS "batteryPct",
    last_seen    AS "lastSeen",
    share_on_map AS "shareOnMap",
    is_mobile    AS "isMobile"
`;

// État fusionné renvoyé par l'upsert. lastSeen = Date (TIMESTAMPTZ côté pg).
interface UpsertedNodeRow {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  lat: number | null;
  lon: number | null;
  batteryPct: number | null;
  lastSeen: Date | null;
  shareOnMap: boolean;
  isMobile: boolean;
}

const NOTIFY_NODE_UPDATE = `SELECT pg_notify('node_update', $1)`;

export async function upsertNode(p: ParsedPacket): Promise<void> {
  const { rows } = await pool.query<UpsertedNodeRow>(UPSERT_NODE, [
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

  // Barrière privacy AU NIVEAU DU TEMPS RÉEL : on ne pousse en SSE que les
  // nodes publics (opt-in, fixes, localisés). Même règle que l'API REST.
  const row = rows[0];
  if (row && isPubliclyVisible(row)) {
    const update: NodeUpdate = {
      nodeId: row.nodeId,
      longName: row.longName,
      shortName: row.shortName,
      lat: row.lat as number, // non-null garanti par isPubliclyVisible
      lon: row.lon as number,
      batteryPct: row.batteryPct,
      lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
    };
    await pool.query(NOTIFY_NODE_UPDATE, [JSON.stringify(update)]);
  }
}

// Nodes affichés sur la carte publique. La barrière privacy est ICI, en SQL :
// opt-in (share_on_map), fixes (NOT is_mobile), et localisés (lat/lon présents).
const SELECT_PUBLIC_NODES = `
  SELECT
    node_id      AS "nodeId",
    long_name    AS "longName",
    short_name   AS "shortName",
    hw_model     AS "hwModel",
    role         AS "role",
    last_lat     AS "lat",
    last_lon     AS "lon",
    last_battery AS "batteryPct",
    last_seen    AS "lastSeen"
  FROM nodes
  WHERE share_on_map = TRUE
    AND is_mobile = FALSE
    AND last_lat IS NOT NULL
    AND last_lon IS NOT NULL
  ORDER BY last_seen DESC NULLS LAST
`;

type PublicNodeRow = Omit<PublicNode, "lastSeen"> & { lastSeen: Date | null };

export async function getPublicNodes(): Promise<PublicNode[]> {
  const { rows } = await pool.query<PublicNodeRow>(SELECT_PUBLIC_NODES);
  return rows.map((r) => ({
    ...r,
    lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
  }));
}
