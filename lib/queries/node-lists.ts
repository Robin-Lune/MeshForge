// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
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

interface NodeOverviewPageRow extends NodeOverviewRow {
  totalCount: string;
}

export interface NodesOverviewPage {
  rows: NodeListItem[];
  total: number;
}

export type NodeOverviewView = "all" | "active" | "low-battery" | "misconfigured";

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

// Champ dérivé commun aux listes nodes. packets24h = transmissions DISTINCTES :
// un node entendu par N gateways génère N lignes pour 1 émission ; on déduplique
// par id (airtime réellement consommé).
const NODES_OVERVIEW_SELECT = `
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
    COALESCE(
      n.gateway_override,
      EXISTS (SELECT 1 FROM packets g WHERE g.gateway_id = n.node_id)
    ) AS "isGateway",
    COALESCE(tx.cnt, 0)                                  AS "packets24h"
  FROM nodes n
  LEFT JOIN (
    SELECT node_id, COUNT(DISTINCT raw->>'id') AS cnt
    FROM packets
    WHERE received_at > NOW() - INTERVAL '24 hours'
    GROUP BY node_id
  ) tx ON tx.node_id = n.node_id
`;

export async function getNodesOverview(): Promise<NodeListItem[]> {
  const maxPackets24h = await getSetting("misconfig_max_packets_24h");
  const { rows } = await pool.query<NodeOverviewRow>(
    `${NODES_OVERVIEW_SELECT} ORDER BY n.last_seen DESC NULLS LAST`,
  );
  return rows.map((r) => toNodeListItem(r, maxPackets24h));
}

const SEARCH_WHERE = `
  (
    "nodeId" ILIKE $1
    OR "longName" ILIKE $1
    OR "shortName" ILIKE $1
  )
`;

function searchPattern(search: string): string {
  return `%${search.trim()}%`;
}

export async function getNodesOverviewPage({
  limit,
  offset,
  search,
  view,
}: {
  limit: number | null;
  offset: number;
  search: string;
  view: NodeOverviewView;
}): Promise<NodesOverviewPage> {
  const maxPackets24h = await getSetting("misconfig_max_packets_24h");
  const q = search.trim();
  const predicates: string[] = [];
  if (q) predicates.push(SEARCH_WHERE);
  if (view === "active") {
    predicates.push(`"active" = TRUE`);
  } else if (view === "low-battery") {
    predicates.push(`"batteryPct" IS NOT NULL AND "batteryPct" < ${LOW_BATTERY_THRESHOLD}`);
  } else if (view === "misconfigured") {
    predicates.push(
      `(
        "hasNodeinfo" = FALSE
        OR "hasPosition" = FALSE
        OR ("batteryPct" IS NOT NULL AND "batteryPct" < ${LOW_BATTERY_THRESHOLD})
        OR "packets24h" > $${q ? 2 : 1}
      )`,
    );
  }
  const where = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";
  const params: Array<string | number> = q ? [searchPattern(q)] : [];
  if (view === "misconfigured") params.push(maxPackets24h);
  const limitSql = limit === null ? "" : `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  if (limit !== null) params.push(limit, offset);

  const { rows } = await pool.query<NodeOverviewPageRow>(
    `
      SELECT page_rows.*, COUNT(*) OVER() AS "totalCount"
      FROM (${NODES_OVERVIEW_SELECT}) page_rows
      ${where}
      ORDER BY "lastSeen" DESC NULLS LAST
      ${limitSql}
    `,
    params,
  );

  if (rows.length === 0) {
    const countParams: Array<string | number> = q ? [searchPattern(q)] : [];
    if (view === "misconfigured") countParams.push(maxPackets24h);
    const count = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM (${NODES_OVERVIEW_SELECT}) page_rows
        ${where}
      `,
      countParams,
    );
    return { rows: [], total: Number(count.rows[0]?.count ?? 0) };
  }

  return {
    rows: rows.map((r) => toNodeListItem(r, maxPackets24h)),
    total: Number(rows[0].totalCount),
  };
}
