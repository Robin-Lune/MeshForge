import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  COUNT_PACKETS_OFF_ALLOWLIST,
  PURGE_NEIGHBORS_OFF_ALLOWLIST,
  PURGE_PACKETS_OFF_ALLOWLIST,
  PURGE_SEGMENTS_OFF_ALLOWLIST,
  REPAIR_POSITIONS_AFTER_PURGE,
  SELECT_NODES_POSITIONED_OFF_ALLOWLIST,
} from "./channel-purge";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase =
  process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const ALLOWLIST = ["Fr_Balise"];

// Un canal retiré de l'allowlist laisse des données en base. `nodes` n'a pas de
// provenance : on repère les nodes positionnés par ces paquets AVANT de les
// supprimer, puis on les repositionne depuis le dernier paquet valide restant.
// Un canal NULL (provenance inconnue) n'est jamais touché.
describeWithDatabase("purge des canaux hors allowlist (PostgreSQL)", () => {
  let client: Client;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL est requis quand RUN_DB_TESTS=1");
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE nodes (
        node_id  TEXT PRIMARY KEY,
        last_lat DOUBLE PRECISION,
        last_lon DOUBLE PRECISION
      );
      CREATE TEMP TABLE packets (
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        node_id TEXT,
        channel TEXT,
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION
      );
      CREATE TEMP TABLE node_neighbors (
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        node_id TEXT NOT NULL,
        neighbor_id TEXT NOT NULL,
        channel TEXT
      );
      CREATE TEMP TABLE traceroute_segments (
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source_node TEXT NOT NULL,
        target_node TEXT NOT NULL,
        channel TEXT
      );
    `);
  });

  beforeEach(async () => {
    await client.query("TRUNCATE nodes, packets, node_neighbors, traceroute_segments");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("compte puis supprime les lignes hors liste dans les trois tables, garde le reste (canal NULL inclus)", async () => {
    await client.query(`
      INSERT INTO packets (node_id, channel) VALUES ('!a','Fr_EMCOM'), ('!a','Fr_Balise'), ('!a',NULL);
      INSERT INTO node_neighbors (node_id, neighbor_id, channel) VALUES ('!a','!b','Fr_EMCOM'), ('!a','!c','Fr_Balise');
      INSERT INTO traceroute_segments (source_node, target_node, channel) VALUES ('!a','!b','Fr_EMCOM'), ('!a','!c',NULL);
    `);

    const count = await client.query<{ count: number }>(COUNT_PACKETS_OFF_ALLOWLIST, [ALLOWLIST]);
    expect(count.rows[0].count).toBe(1);

    const p = await client.query(PURGE_PACKETS_OFF_ALLOWLIST, [ALLOWLIST]);
    const n = await client.query(PURGE_NEIGHBORS_OFF_ALLOWLIST, [ALLOWLIST]);
    const t = await client.query(PURGE_SEGMENTS_OFF_ALLOWLIST, [ALLOWLIST]);

    expect([p.rowCount, n.rowCount, t.rowCount]).toEqual([1, 1, 1]);
    const left = await client.query(
      "SELECT (SELECT COUNT(*) FROM packets)::int AS p, (SELECT COUNT(*) FROM node_neighbors)::int AS n, (SELECT COUNT(*) FROM traceroute_segments)::int AS t",
    );
    expect(left.rows[0]).toEqual({ p: 2, n: 1, t: 1 });
  });

  it("repositionne les nodes touchés depuis le dernier paquet valide restant, sinon NULL", async () => {
    await client.query(`
      INSERT INTO nodes (node_id, last_lat, last_lon) VALUES
        ('!mixed', -21.9, 55.9),   -- position courante venue du canal retiré
        ('!only',  -21.8, 55.8),   -- entendu uniquement sur le canal retiré
        ('!clean', -21.7, 55.7);   -- jamais sur ce canal : intouché
      INSERT INTO packets (received_at, node_id, channel, lat, lon) VALUES
        (NOW() - INTERVAL '2 days', '!mixed', 'Fr_Balise', -21.1, 55.1),
        (NOW() - INTERVAL '1 day',  '!mixed', 'Fr_EMCOM',  -21.9, 55.9),
        (NOW() - INTERVAL '3 days', '!mixed', 'Fr_Balise', 0, 0),
        (NOW() - INTERVAL '1 day',  '!only',  'Fr_EMCOM',  -21.8, 55.8),
        (NOW() - INTERVAL '1 day',  '!clean', 'Fr_Balise', -21.7, 55.7);
    `);

    const affected = await client.query<{ nodeId: string }>(
      SELECT_NODES_POSITIONED_OFF_ALLOWLIST,
      [ALLOWLIST],
    );
    const ids = affected.rows.map((r) => r.nodeId).sort();
    expect(ids).toEqual(["!mixed", "!only"]);

    await client.query(PURGE_PACKETS_OFF_ALLOWLIST, [ALLOWLIST]);
    const repaired = await client.query(REPAIR_POSITIONS_AFTER_PURGE, [ids]);
    expect(repaired.rowCount).toBe(2);

    const rows = await client.query(
      "SELECT node_id, last_lat, last_lon FROM nodes ORDER BY node_id",
    );
    expect(rows.rows).toEqual([
      { node_id: "!clean", last_lat: -21.7, last_lon: 55.7 },
      { node_id: "!mixed", last_lat: -21.1, last_lon: 55.1 },
      { node_id: "!only", last_lat: null, last_lon: null },
    ]);
  });
});
