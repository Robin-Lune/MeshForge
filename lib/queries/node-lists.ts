import { pool } from "../db";
import type { MisconfigReason, NodeListItem } from "../../types";

// Seuils des vues listes (Phase 5). Tunables ici (source unique).
export const LOW_BATTERY_THRESHOLD = 20; // %, sous ce niveau = batterie faible

// Seuil « trop bavard » : transmissions DISTINCTES / 24h au-delà desquelles un
// node est jugé bavard. On compte les émissions (id de paquet distinct), PAS les
// réceptions : un node entendu par N gateways génère N lignes pour 1 seule
// émission. C'est l'airtime réellement consommé qui sature le mesh, donc on
// déduplique par id. Tunable via l'env MISCONFIG_MAX_PACKETS_24H.
const DEFAULT_MAX_PACKETS_24H = 1000;

// Parse le seuil depuis l'env : entier > 0, sinon `fallback` (logique pure).
export function parseMaxPackets24h(
  raw: string | undefined,
  fallback = DEFAULT_MAX_PACKETS_24H,
): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const MISCONFIG_MAX_PACKETS_24H = parseMaxPackets24h(
  process.env.MISCONFIG_MAX_PACKETS_24H,
);

// Sous-ensemble d'une ligne suffisant pour classer (testé isolément).
type ClassifyInput = {
  hasNodeinfo: boolean;
  hasPosition: boolean;
  batteryPct: number | null;
  packets24h: number;
};

// Raisons « mal configuré » pour un node (vide = sain). Ordre stable.
export function classifyMisconfig(
  row: ClassifyInput,
  maxPackets24h = MISCONFIG_MAX_PACKETS_24H,
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
  maxPackets24h = MISCONFIG_MAX_PACKETS_24H,
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
// DB : le filtrage par onglet (actifs / batterie / mal configurés) se fait côté
// page. packets24h = transmissions DISTINCTES (cf. MISCONFIG_MAX_PACKETS_24H).
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
  const { rows } = await pool.query<NodeOverviewRow>(SELECT_NODES_OVERVIEW);
  return rows.map((r) => toNodeListItem(r));
}
