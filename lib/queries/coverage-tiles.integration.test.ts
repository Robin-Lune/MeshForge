// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lonLatToTile, tileToBounds } from "../tiles";
import {
  SELECT_COVERAGE_TILES,
  SELECT_COVERAGE_TILES_BOUNDED,
} from "./coverage-tiles";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase =
  process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const CHANNELS = ["Fr_Balise", "Fr_BlaBla"];
const ZOOM = 15;

describeWithDatabase("SELECT_COVERAGE_TILES (PostgreSQL)", () => {
  let client: Client;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL est requis quand RUN_DB_TESTS=1");
    }

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("SET TIME ZONE 'UTC'");
    await client.query(`
      CREATE TEMP TABLE nodes (
        node_id TEXT PRIMARY KEY,
        excluded BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TEMP TABLE packets (
        received_at TIMESTAMPTZ NOT NULL,
        gateway_id TEXT,
        node_id TEXT,
        packet_type TEXT,
        channel TEXT,
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION,
        snr REAL,
        hop_count SMALLINT,
        raw JSONB
      );
    `);
  });

  beforeEach(async () => {
    await client.query("TRUNCATE packets, nodes");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("filtre les positions ambiguës sans masquer une sonde unique", async () => {
    const reference = lonLatToTile(55.515, -21.115, ZOOM);
    const soloReference = lonLatToTile(55.8, -21.4, ZOOM);
    const bounds = tileToBounds(reference.x, reference.y, ZOOM);
    const lat = (bounds.south + bounds.north) / 2;
    const lon = (bounds.west + bounds.east) / 2;

    await client.query(`
      INSERT INTO nodes (node_id) VALUES
        ('!c0000001'),
        ('!d0000001'), ('!d0000002'), ('!d0000003'),
        ('!d0000004'), ('!d0000005'), ('!d0000006'),
        ('!d0000007'), ('!d0000008'), ('!d0000009');
      INSERT INTO nodes (node_id, excluded) VALUES ('!d000000a', TRUE);
    `);

    await client.query(
      `
        INSERT INTO packets (
          received_at, gateway_id, node_id, packet_type, channel,
          lat, lon, snr, hop_count, raw
        ) VALUES
          (CURRENT_DATE + TIME '12:00' - INTERVAL '1 day',
           '!c0000001', '!d0000001', 'position', 'Fr_Balise',
           $1, $2, -12, 0,
           '{"id":101,"payload":{"precision_bits":32}}'),
          (CURRENT_DATE + TIME '12:00' - INTERVAL '2 days',
           '!c0000001', '!d0000002', 'position', 'Fr_Balise',
           $1, $2, -8, 0,
           '{"id":102,"payload":{"precision_bits":32}}'),
          (CURRENT_DATE + TIME '12:00' - INTERVAL '3 days',
           '!c0000001', '!d0000003', 'position', 'Fr_Balise',
           $1, $2, -4, 0,
           '{"id":103,"payload":{"precision_bits":32}}'),

          -- Trop imprécis pour tenir dans cette tuile z15.
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d0000004', 'position', 'Fr_Balise',
           $1, $2, 20, 0,
           '{"id":104,"payload":{"precision_bits":15}}'),
          -- Précision ou identifiant ambigu : fail-closed.
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d0000005', 'position', 'Fr_Balise',
           $1, $2, 20, 0,
           '{"id":105,"payload":{}}'),
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d0000006', 'position', 'Fr_Balise',
           $1, $2, 20, 0,
           '{"payload":{"precision_bits":32}}'),
          -- Canal retiré, hop relayé, opt-out et ligne de démo sont refusés.
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d0000007', 'position', 'Ancien_Canal',
           $1, $2, 20, 0,
           '{"id":107,"payload":{"precision_bits":32}}'),
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d0000008', 'position', 'Fr_Balise',
           $1, $2, 20, 1,
           '{"id":108,"payload":{"precision_bits":32}}'),
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d000000a', 'position', 'Fr_Balise',
           $1, $2, 20, 0,
           '{"id":110,"payload":{"precision_bits":32}}'),
          (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
           '!c0000001', '!d0000009', 'position', 'Fr_Balise',
           $1, $2, 20, 0,
           '{"id":109,"meshforge_demo":true,"payload":{"precision_bits":32}}')
      `,
      [lat, lon],
    );

    // Une sonde unique dans une autre tuile doit rester visible : c'est le cas
    // d'usage principal d'un parcours de mesure dans un quartier.
    await client.query(`
      INSERT INTO packets (
        received_at, gateway_id, node_id, packet_type, channel,
        lat, lon, snr, hop_count, raw
      ) VALUES
        (NOW(), '!c0000001', '!d0000001', 'position', 'Fr_Balise',
         -21.4, 55.8, -5, 0,
         '{"id":201,"payload":{"precision_bits":32}}');
    `);

    const { rows } = await client.query(SELECT_COVERAGE_TILES_BOUNDED, [
      ZOOM,
      false,
      CHANNELS,
      -22,
      -20,
      54,
      56,
    ]);

    expect(rows).toHaveLength(2);
    expect(
      rows.find(
        (row) => row.tx === reference.x && row.ty === reference.y,
      ),
    ).toMatchObject({
      tx: reference.x,
      ty: reference.y,
      snrP90: expect.closeTo(-4.8, 4),
      snrMax: -4,
      gateways: 1,
      nodes: 3,
      transmissions: 3,
      samples: 3,
      days: 3,
    });
    expect(
      rows.find(
        (row) => row.tx === soloReference.x && row.ty === soloReference.y,
      ),
    ).toMatchObject({
      tx: soloReference.x,
      ty: soloReference.y,
      snrP90: -5,
      snrMax: -5,
      gateways: 1,
      nodes: 1,
      transmissions: 1,
      samples: 1,
      days: 1,
    });
  });

  it("déduplique par gateway sans fusionner une réutilisation tardive d'ID", async () => {
    await client.query(`
      INSERT INTO nodes (node_id) VALUES
        ('!c0000001'), ('!c0000002'),
        ('!d0000001'), ('!d0000002'), ('!d0000003');

      INSERT INTO packets (
        received_at, gateway_id, node_id, packet_type, channel,
        lat, lon, snr, hop_count, raw
      ) VALUES
        -- Une émission, deux topics sur la même gateway et une autre gateway.
        (CURRENT_DATE + TIME '12:00' - INTERVAL '1 day',
         '!c0000001', '!d0000001', 'position', 'Fr_Balise',
         -21.115, 55.515, -12, 0,
         '{"id":700,"payload":{"precision_bits":32}}'),
        (CURRENT_DATE + TIME '12:00' - INTERVAL '1 day',
         '!c0000001', '!d0000001', 'position', 'Fr_Balise',
         -21.115, 55.515, -10, 0,
         '{"id":700,"payload":{"precision_bits":32}}'),
        (CURRENT_DATE + TIME '12:00' - INTERVAL '1 day',
         '!c0000002', '!d0000001', 'position', 'Fr_Balise',
         -21.115, 55.515, -3, 0,
         '{"id":700,"payload":{"precision_bits":32}}'),

        -- Même node et même ID, mais dix jours avant : autre émission.
        (CURRENT_DATE + TIME '12:00' - INTERVAL '10 days',
         '!c0000001', '!d0000001', 'position', 'Fr_Balise',
         -21.115, 55.515, -6, 0,
         '{"id":700,"payload":{"precision_bits":32}}'),
        -- Même ID numérique, autre émetteur : autre émission.
        (CURRENT_DATE + TIME '12:00' - INTERVAL '2 days',
         '!c0000001', '!d0000002', 'position', 'Fr_Balise',
         -21.115, 55.515, -7, 0,
         '{"id":700,"payload":{"precision_bits":32}}'),
        (CURRENT_DATE + TIME '12:00' - INTERVAL '3 days',
         '!c0000001', '!d0000003', 'position', 'Fr_Balise',
         -21.115, 55.515, -9, 0,
         '{"id":701,"payload":{"precision_bits":32}}'),
        -- Sans ID : jamais compté comme une fausse transmission indépendante.
        (CURRENT_DATE + TIME '12:00' - INTERVAL '4 days',
         '!c0000002', '!d0000003', 'position', 'Fr_Balise',
         -21.115, 55.515, 30, 0,
         '{"payload":{"precision_bits":32}}');
    `);

    const { rows } = await client.query(SELECT_COVERAGE_TILES, [
      ZOOM,
      false,
      CHANNELS,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      snrP90: expect.closeTo(-4.2, 4),
      snrMax: -3,
      gateways: 2,
      nodes: 3,
      transmissions: 4,
      samples: 5,
      days: 4,
    });
  });
});
