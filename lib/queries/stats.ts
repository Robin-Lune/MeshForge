import { pool } from "../db";
import type { Stats } from "../../types";

// Agrégats du dashboard. Mêmes filtres privacy que getPublicNodes pour les
// compteurs de nodes (on ne compte que ce qui est affichable sur la carte).
// "online" = node public vu dans les 15 dernières minutes.
const SELECT_STATS = `
  SELECT
    (SELECT COUNT(*) FROM nodes
       WHERE share_on_map = TRUE AND is_mobile = FALSE
         AND last_lat IS NOT NULL AND last_lon IS NOT NULL)        AS "nodesTotal",
    (SELECT COUNT(*) FROM nodes
       WHERE share_on_map = TRUE AND is_mobile = FALSE
         AND last_lat IS NOT NULL AND last_lon IS NOT NULL
         AND last_seen > NOW() - INTERVAL '15 minutes')            AS "nodesOnline",
    (SELECT COUNT(*) FROM packets
       WHERE received_at > NOW() - INTERVAL '24 hours')            AS "packets24h",
    (SELECT MAX(received_at) FROM packets)                         AS "lastPacketAt"
`;

// COUNT(*) renvoie un BIGINT -> pg le sérialise en string : on reconvertit.
interface StatsRow {
  nodesTotal: string;
  nodesOnline: string;
  packets24h: string;
  lastPacketAt: Date | null;
}

export async function getStats(): Promise<Stats> {
  const { rows } = await pool.query<StatsRow>(SELECT_STATS);
  const r = rows[0];
  return {
    nodesTotal: Number(r.nodesTotal),
    nodesOnline: Number(r.nodesOnline),
    packets24h: Number(r.packets24h),
    lastPacketAt: r.lastPacketAt ? r.lastPacketAt.toISOString() : null,
  };
}
