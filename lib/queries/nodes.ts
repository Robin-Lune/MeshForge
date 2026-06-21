import { pool } from "../db";
import { isPubliclyVisible, snapToGrid } from "../privacy";
import type { ParsedPacket, PublicNode, NodeUpdate, NodeDetail } from "../../types";

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
    // Mobile : position floutée (cellule ~1,5 km constante) avant exposition.
    const pos = row.isMobile
      ? snapToGrid(row.lat as number, row.lon as number)
      : { lat: row.lat as number, lon: row.lon as number };
    const update: NodeUpdate = {
      nodeId: row.nodeId,
      longName: row.longName,
      shortName: row.shortName,
      lat: pos.lat,
      lon: pos.lon,
      batteryPct: row.batteryPct,
      lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
    };
    await pool.query(NOTIFY_NODE_UPDATE, [JSON.stringify(update)]);
  }
}

// Nodes affichés sur la carte publique (PUBLIC PAR DÉFAUT : tous les localisés).
// Les mobiles sont INCLUS mais leur position est snappée ~1,5 km dans le mapping.
// isGateway : relaie vers MQTT. lastSnr : dernier SNR reçu (fiche survol).
const SELECT_PUBLIC_NODES = `
  SELECT
    n.node_id      AS "nodeId",
    n.long_name    AS "longName",
    n.short_name   AS "shortName",
    n.hw_model     AS "hwModel",
    n.role         AS "role",
    n.last_lat     AS "lat",
    n.last_lon     AS "lon",
    n.last_battery AS "batteryPct",
    n.last_seen    AS "lastSeen",
    n.is_mobile    AS "isMobile",
    EXISTS (SELECT 1 FROM packets p WHERE p.gateway_id = n.node_id) AS "isGateway",
    (SELECT p.snr FROM packets p
       WHERE p.node_id = n.node_id AND p.snr IS NOT NULL
       ORDER BY p.received_at DESC LIMIT 1)                         AS "lastSnr"
  FROM nodes n
  WHERE n.last_lat IS NOT NULL
    AND n.last_lon IS NOT NULL
  ORDER BY n.last_seen DESC NULLS LAST
`;

type PublicNodeRow = Omit<PublicNode, "lastSeen"> & { lastSeen: Date | null };

export async function getPublicNodes(): Promise<PublicNode[]> {
  const { rows } = await pool.query<PublicNodeRow>(SELECT_PUBLIC_NODES);
  return rows.map((r) => {
    // Mobile → position snappée (cellule ~1,5 km constante) ; fixe → exacte.
    const pos = r.isMobile
      ? snapToGrid(r.lat, r.lon)
      : { lat: r.lat, lon: r.lon };
    return {
      ...r,
      lat: pos.lat,
      lon: pos.lon,
      lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
    };
  });
}

// Détail d'un node (page /node/[id], au clic sur un marker).
const SELECT_NODE_BY_ID = `
  SELECT
    node_id      AS "nodeId",
    long_name    AS "longName",
    short_name   AS "shortName",
    hw_model     AS "hwModel",
    firmware     AS "firmware",
    role         AS "role",
    last_lat     AS "lat",
    last_lon     AS "lon",
    last_battery AS "batteryPct",
    last_seen    AS "lastSeen",
    first_seen   AS "firstSeen",
    is_mobile    AS "isMobile",
    EXISTS (SELECT 1 FROM packets p WHERE p.gateway_id = nodes.node_id)  AS "isGateway",
    (SELECT p.snr FROM packets p
       WHERE p.node_id = nodes.node_id AND p.snr IS NOT NULL
       ORDER BY p.received_at DESC LIMIT 1)                              AS "lastSnr"
  FROM nodes WHERE node_id = $1
`;

type NodeDetailRow = Omit<NodeDetail, "lastSeen" | "firstSeen"> & {
  lastSeen: Date | null;
  firstSeen: Date | null;
};

export async function getNodeById(nodeId: string): Promise<NodeDetail | null> {
  const { rows } = await pool.query<NodeDetailRow>(SELECT_NODE_BY_ID, [nodeId]);
  const r = rows[0];
  if (!r) return null;
  return {
    ...r,
    lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
    firstSeen: r.firstSeen ? r.firstSeen.toISOString() : null,
  };
}
