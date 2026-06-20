import { pool } from "../db";
import type { Stats, NetworkStats, StatBucket } from "../../types";

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

// ---------------------------------------------------------------------------
// Statistiques réseau (page /stats). Agrégats sur TOUT le réseau capté : aucun
// filtre privacy ici (un agrégat n'expose aucun individu). La barrière privacy
// reste sur la carte + temps réel. Cf. docs/analytics.md — ne pas réuniformiser.
// ---------------------------------------------------------------------------

// Ligne brute d'une répartition (GROUP BY). pg sérialise COUNT(*) en string.
interface BucketRow {
  label: string | null;
  count: string | number;
}

// Normalise une répartition : label NULL -> "inconnu", count -> number, tri desc.
export function toBuckets(rows: BucketRow[]): StatBucket[] {
  return rows
    .map((r) => ({ label: r.label ?? "inconnu", count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);
}

// Ligne agrégée des KPI (AVG/COUNT renvoyés en string par pg).
interface KpiRow {
  nodesTotal: string;
  nodesActive24h: string;
  packets24h: string;
  avgChannelUtil: string | null;
  avgAirUtilTx: string | null;
  lastPacketAt: Date | null;
}

type Kpi = Pick<
  NetworkStats,
  | "nodesTotal"
  | "nodesActive24h"
  | "packets24h"
  | "packetsPerMin"
  | "avgChannelUtil"
  | "avgAirUtilTx"
  | "lastPacketAt"
>;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const MINUTES_24H = 24 * 60;

// Assemble les KPI à partir de la ligne agrégée (logique pure, testée).
export function buildKpi(row: KpiRow): Kpi {
  const packets24h = Number(row.packets24h);
  return {
    nodesTotal: Number(row.nodesTotal),
    nodesActive24h: Number(row.nodesActive24h),
    packets24h,
    packetsPerMin: round2(packets24h / MINUTES_24H),
    avgChannelUtil:
      row.avgChannelUtil != null ? round2(Number(row.avgChannelUtil)) : null,
    avgAirUtilTx:
      row.avgAirUtilTx != null ? round2(Number(row.avgAirUtilTx)) : null,
    lastPacketAt: row.lastPacketAt ? row.lastPacketAt.toISOString() : null,
  };
}

// KPI : aucun filtre privacy (cf. en-tête). nodesActive24h = vu dans les 24h.
const SELECT_KPI = `
  SELECT
    (SELECT COUNT(*) FROM nodes)                          AS "nodesTotal",
    (SELECT COUNT(*) FROM nodes
       WHERE last_seen > NOW() - INTERVAL '24 hours')     AS "nodesActive24h",
    (SELECT COUNT(*) FROM packets
       WHERE received_at > NOW() - INTERVAL '24 hours')   AS "packets24h",
    (SELECT AVG(channel_util) FROM packets
       WHERE received_at > NOW() - INTERVAL '24 hours')   AS "avgChannelUtil",
    (SELECT AVG(air_util_tx) FROM packets
       WHERE received_at > NOW() - INTERVAL '24 hours')   AS "avgAirUtilTx",
    (SELECT MAX(received_at) FROM packets)                AS "lastPacketAt"
`;

// Répartitions : activité (packets, 24h) vs parc (nodes, état courant).
const SELECT_BY_PACKET_TYPE = `
  SELECT packet_type AS label, COUNT(*) AS count FROM packets
  WHERE received_at > NOW() - INTERVAL '24 hours'
  GROUP BY packet_type ORDER BY count DESC`;
const SELECT_BY_HOP_COUNT = `
  SELECT hop_count::text AS label, COUNT(*) AS count FROM packets
  WHERE received_at > NOW() - INTERVAL '24 hours'
  GROUP BY hop_count ORDER BY count DESC`;
const SELECT_BY_HW_MODEL = `
  SELECT hw_model AS label, COUNT(*) AS count FROM nodes
  GROUP BY hw_model ORDER BY count DESC`;
const SELECT_BY_ROLE = `
  SELECT role AS label, COUNT(*) AS count FROM nodes
  GROUP BY role ORDER BY count DESC`;

export async function getNetworkStats(): Promise<NetworkStats> {
  const [kpi, byPacketType, byHopCount, byHwModel, byRole] = await Promise.all([
    pool.query<KpiRow>(SELECT_KPI),
    pool.query<BucketRow>(SELECT_BY_PACKET_TYPE),
    pool.query<BucketRow>(SELECT_BY_HOP_COUNT),
    pool.query<BucketRow>(SELECT_BY_HW_MODEL),
    pool.query<BucketRow>(SELECT_BY_ROLE),
  ]);

  return {
    ...buildKpi(kpi.rows[0]),
    byPacketType: toBuckets(byPacketType.rows),
    byHopCount: toBuckets(byHopCount.rows),
    byHwModel: toBuckets(byHwModel.rows),
    byRole: toBuckets(byRole.rows),
  };
}
