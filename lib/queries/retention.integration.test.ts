import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DELETE_SILENT_NODES,
  PURGE_NODE_NEIGHBORS,
  PURGE_TRACEROUTE_SEGMENTS,
  SCRUB_SILENT_NODES,
} from "./retention";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase =
  process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const DAYS = 30;

// Les politiques TimescaleDB de `packets` ne sont pas testables ici (Postgres
// nu en CI) ; on vérifie les requêtes de purge des tables simples et de `nodes`.
describeWithDatabase("purge de rétention (PostgreSQL)", () => {
  let client: Client;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL est requis quand RUN_DB_TESTS=1");
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE nodes (
        node_id     TEXT PRIMARY KEY,
        long_name   TEXT,
        last_lat    DOUBLE PRECISION,
        last_lon    DOUBLE PRECISION,
        last_battery SMALLINT,
        last_seen   TIMESTAMPTZ,
        first_seen  TIMESTAMPTZ DEFAULT NOW(),
        excluded    BOOLEAN NOT NULL DEFAULT FALSE,
        anonymized  BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TEMP TABLE node_neighbors (
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        node_id TEXT NOT NULL,
        neighbor_id TEXT NOT NULL
      );
      CREATE TEMP TABLE traceroute_segments (
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source_node TEXT NOT NULL,
        target_node TEXT NOT NULL
      );
    `);
  });

  beforeEach(async () => {
    await client.query("TRUNCATE nodes, node_neighbors, traceroute_segments");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("supprime les voisins et segments plus vieux que la durée, garde les récents", async () => {
    await client.query(`
      INSERT INTO node_neighbors (received_at, node_id, neighbor_id) VALUES
        (NOW() - INTERVAL '31 days', '!a', '!b'),
        (NOW() - INTERVAL '29 days', '!a', '!c');
      INSERT INTO traceroute_segments (received_at, source_node, target_node) VALUES
        (NOW() - INTERVAL '31 days', '!a', '!b'),
        (NOW() - INTERVAL '1 day', '!a', '!c');
    `);

    const n = await client.query(PURGE_NODE_NEIGHBORS, [DAYS]);
    const t = await client.query(PURGE_TRACEROUTE_SEGMENTS, [DAYS]);

    expect(n.rowCount).toBe(1);
    expect(t.rowCount).toBe(1);
    const left = await client.query(
      "SELECT (SELECT COUNT(*) FROM node_neighbors)::int AS n, (SELECT COUNT(*) FROM traceroute_segments)::int AS t",
    );
    expect(left.rows[0]).toEqual({ n: 1, t: 1 });
  });

  it("supprime un node muet sans marque RGPD, scrubbe un node muet exclu ou anonymisé, garde les actifs", async () => {
    await client.query(`
      INSERT INTO nodes (node_id, long_name, last_lat, last_lon, last_battery, last_seen, excluded, anonymized) VALUES
        ('!silent',  'Muet',   -21.1, 55.5, 80, NOW() - INTERVAL '31 days', FALSE, FALSE),
        ('!optout',  'Retiré', -21.2, 55.6, 70, NOW() - INTERVAL '31 days', TRUE,  FALSE),
        ('!anon',    NULL,     -21.3, 55.7, 60, NOW() - INTERVAL '31 days', FALSE, TRUE),
        ('!active',  'Actif',  -21.4, 55.8, 50, NOW() - INTERVAL '1 day',   FALSE, FALSE);
      -- Jamais vu (last_seen NULL) mais découvert il y a longtemps : muet aussi.
      INSERT INTO nodes (node_id, first_seen) VALUES ('!ghost', NOW() - INTERVAL '31 days');
    `);

    const scrubbed = await client.query(SCRUB_SILENT_NODES, [DAYS]);
    const deleted = await client.query(DELETE_SILENT_NODES, [DAYS]);

    expect(scrubbed.rowCount).toBe(2); // !optout et !anon
    expect(deleted.rowCount).toBe(2); // !silent et !ghost

    const rows = await client.query(
      "SELECT node_id, last_lat, last_lon, last_battery, excluded, anonymized FROM nodes ORDER BY node_id",
    );
    expect(rows.rows).toEqual([
      { node_id: "!active", last_lat: -21.4, last_lon: 55.8, last_battery: 50, excluded: false, anonymized: false },
      { node_id: "!anon", last_lat: null, last_lon: null, last_battery: null, excluded: false, anonymized: true },
      { node_id: "!optout", last_lat: null, last_lon: null, last_battery: null, excluded: true, anonymized: false },
    ]);
  });
});
