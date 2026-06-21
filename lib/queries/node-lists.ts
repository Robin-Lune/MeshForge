import { pool } from "../db";
import { getSetting } from "./settings";
import type { MisconfigReason, NodeListItem } from "../../types";

export const LOW_BATTERY_THRESHOLD = 20; // %, sous ce niveau = batterie faible

// Sous-ensemble d'une ligne suffisant pour classer (testé isolément).
type ClassifyInput = {
  hasNodeinfo: boolean;
  hasPosition: boolean;
  batteryPct: number | null;
  packets24h: number;
};

// Raisons « mal configuré » pour un node (vide = sain). Ordre stable. Le seuil
// « trop bavard » est fourni par l'appelant (config DB `misconfig_max_packets_24h`).
// On compte les transmissions DISTINCTES, pas les réceptions (cf. SELECT).
export function classifyMisconfig(
  row: ClassifyInput,
  maxPackets24h: number,
): MisconfigReason[] {
  const reasons: MisconfigReason[] = [];
  if (!row.hasNodeinfo) reasons.push("no-nodeinfo");
  if (!row.hasPosition) reasons.push("no-position");
  if (row.batteryPct != null && row.batteryPct < LOW_BATTERY_THRESHOLD)
    reasons.push("low-battery");
  if (row.packets24h > maxPackets24h) reasons.push("too-chatty");
  return reasons;
}

// Ligne brute renvoyée par SELECT_NODES_OVERVIEW (pg : COUNT bigint -> string).
interface NodeOverviewRow {
  nodeId: string;
  longName: string | null;
  shortName: string | null;
  hwModel: string | null;
  role: string | null;
  batteryPct: number | null;
  lastSeen: Date | null;
  isMobile: boolean;
  isGateway: boolean;
  active: boolean;
  hasNodeinfo: boolean;
  hasPosition: boolean;
  packets24h: string | number;
}

// Normalise une ligne DB -> item d'affichage (logique pure, testée).
export function toNodeListItem(
  row: NodeOverviewRow,
  maxPackets24h: number,
): NodeListItem {
  const packets24h = Number(row.packets24h);
  return {
    nodeId: row.nodeId,
    longName: row.longName,
    shortName: row.shortName,
    hwModel: row.hwModel,
    role: row.role,
    batteryPct: row.batteryPct,
    lastSeen: row.lastSeen ? row.lastSeen.toISOString() : null,
    isMobile: row.isMobile,
    isGateway: row.isGateway,
    active: row.active,
    packets24h,
    misconfig: classifyMisconfig({ ...row, packets24h }, maxPackets24h),
  };
}

// Tous les nodes avec les champs dérivés nécessaires aux 3 vues. Un seul aller
// DB pour les nodes : le filtrage par onglet (actifs / batterie / mal
// configurés) se fait côté page. packets24h = transmissions DISTINCTES : un node
// entendu par N gateways génère N lignes pour 1 émission ; on déduplique par id
// (airtime réellement consommé). Le seuil « bavard » vient de la config DB.
const SELECT_NODES_OVERVIEW = `
  SELECT
    n.node_id      AS "nodeId",
    n.long_name    AS "longName",
    n.short_name   AS "shortName",
    n.hw_model     AS "hwModel",
    n.role         AS "role",
    n.last_battery AS "batteryPct",
    n.last_seen    AS "lastSeen",
    n.is_mobile    AS "isMobile",
    (n.long_name IS NOT NULL)                           AS "hasNodeinfo",
    (n.last_lat IS NOT NULL AND n.last_lon IS NOT NULL) AS "hasPosition",
    (n.last_seen > NOW() - INTERVAL '24 hours')         AS "active",
    EXISTS (SELECT 1 FROM packets g WHERE g.gateway_id = n.node_id) AS "isGateway",
    COALESCE(tx.cnt, 0)                                  AS "packets24h"
  FROM nodes n
  LEFT JOIN (
    SELECT node_id, COUNT(DISTINCT raw->>'id') AS cnt
    FROM packets
    WHERE received_at > NOW() - INTERVAL '24 hours'
    GROUP BY node_id
  ) tx ON tx.node_id = n.node_id
  ORDER BY n.last_seen DESC NULLS LAST
`;

export async function getNodesOverview(): Promise<NodeListItem[]> {
  const maxPackets24h = await getSetting("misconfig_max_packets_24h");
  const { rows } = await pool.query<NodeOverviewRow>(SELECT_NODES_OVERVIEW);
  return rows.map((r) => toNodeListItem(r, maxPackets24h));
}
