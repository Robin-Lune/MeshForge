-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Robin Lebon — La Forge Numérique
-- Compression des paquets après 7 jours, suppression après 60 jours.
-- Idempotente : peut être rejouée sans recréer les politiques.

CREATE EXTENSION IF NOT EXISTS timescaledb;

ALTER TABLE packets SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'received_at DESC',
    timescaledb.compress_segmentby = 'node_id'
);

SELECT add_compression_policy(
    'packets',
    compress_after => INTERVAL '7 days',
    if_not_exists => TRUE
);

SELECT add_retention_policy(
    'packets',
    drop_after => INTERVAL '60 days',
    if_not_exists => TRUE
);
