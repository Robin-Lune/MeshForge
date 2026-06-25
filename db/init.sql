-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Robin Lebon — La Forge Numérique
-- MeshForge — Schéma initial (Phase 1)
-- Exécuté automatiquement par l'image
-- TimescaleDB au premier démarrage (monté dans /docker-entrypoint-initdb.d).

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- packets — hypertable principale. Une ligne = un paquet capté par un relais.
-- rssi/snr = qualité du DERNIER hop (node qui relais le packet -> gateway), pas de l'émetteur
-- lat/lon/altitude/batterie sont mis à plat (colonnes) pour les requêtes
-- géo/time-series directes ; `raw` conserve le payload complet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packets (
    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    gateway_id    TEXT,             -- relais qui a capté le paquet (ex: !gateway01)
    node_id       TEXT,             -- émetteur (NodeID, ex: !a1b2c3d4)
    packet_type   TEXT,             -- position / telemetry / nodeinfo / neighborinfo / rangetest
    channel       TEXT,             -- nom ou index du canal (ex: Fr_Balise)
    lat           DOUBLE PRECISION,
    lon           DOUBLE PRECISION,
    altitude      INTEGER,
    rssi          SMALLINT,         -- qualité du DERNIER hop (pas de l'émetteur original)
    snr           REAL,
    hop_count     SMALLINT,
    battery_pct   SMALLINT,
    voltage       REAL,
    channel_util  REAL,
    air_util_tx   REAL,
    raw           JSONB             -- payload complet (ne rien perdre)
);

SELECT create_hypertable('packets', 'received_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_packets_node    ON packets (node_id,     received_at DESC);
CREATE INDEX IF NOT EXISTS idx_packets_type    ON packets (packet_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_packets_gateway ON packets (gateway_id,  received_at DESC);
-- Index géospatial pour la heatmap (GROUP BY bucket lat/lon).
CREATE INDEX IF NOT EXISTS idx_packets_geo     ON packets (lat, lon) WHERE lat IS NOT NULL;

-- ---------------------------------------------------------------------------
-- nodes — dernier état connu d'un node. Upsert à chaque paquet reçu.
-- Aucune série temporelle ici : les courbes vivent dans `packets`.
-- Privacy: public par défaut, consentement à la source.
--   is_mobile = TRUE (DÉFAUT prudent) -> position snappée (~0.5 km) avant affichage
--     (node visible mais flou). Protège une position MQTT précise saisie par erreur.
--     L'admin passe is_mobile = FALSE à la main pour un relais fixe assumé (exacte).
--   excluded  = true -> opt-out RGPD : node retiré de la carte
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodes (
    node_id       TEXT PRIMARY KEY,
    long_name     TEXT,
    short_name    TEXT,
    hw_model      TEXT,                       -- ex: HELTEC_V4
    firmware      TEXT,
    role          TEXT,                       -- CLIENT / ROUTER / ROUTER_CLIENT / etc.
    is_mobile     BOOLEAN DEFAULT TRUE,       -- défaut prudent : position floutée ~0.5 km
    last_lat      DOUBLE PRECISION,
    last_lon      DOUBLE PRECISION,
    last_battery  SMALLINT,
    last_seen     TIMESTAMPTZ,
    first_seen    TIMESTAMPTZ DEFAULT NOW(),
    excluded      BOOLEAN NOT NULL DEFAULT FALSE,  -- opt-out RGPD (droit de retrait)
    anonymized    BOOLEAN NOT NULL DEFAULT FALSE,  -- RGPD : noms effacés DÉFINITIVEMENT
    gateway_override BOOLEAN                        -- NULL=auto, TRUE/FALSE=forcé admin
);

-- Idempotent pour les bases existantes (RGPD, Phase 5).
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS anonymized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS gateway_override BOOLEAN;
-- Colonne morte retirée : la visibilité ne dépend QUE de excluded + règles privacy.
ALTER TABLE nodes DROP COLUMN IF EXISTS share_on_map;
-- is_mobile par défaut prudent (privacy) : flou ~0.5 km sauf relais fixe confirmé.
-- N'affecte QUE les futurs INSERT ; les nodes existants gardent leur valeur.
ALTER TABLE nodes ALTER COLUMN is_mobile SET DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- contributors — comptes. Auth MQTT (mosquitto-go-auth) ET auth web.
--   role = 'USER' (défaut) : enregistre un node MQTT. Posé à l'inscription.
--   role = 'ADMIN'         : accès admin web (Trames, config). Posé À LA MAIN
--                            (SQL / `yarn create-admin`), jamais via l'app.
--   password = bcrypt (token MQTT pour les USERs, mot de passe pour les ADMINs).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contributors (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,                -- bcrypt hash
    email       TEXT,
    node_name   TEXT,
    role        TEXT NOT NULL DEFAULT 'USER',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent pour les bases existantes (CREATE TABLE IF NOT EXISTS ne migre pas).
ALTER TABLE contributors ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER';
DO $$ BEGIN
    ALTER TABLE contributors
        ADD CONSTRAINT contributors_role_chk CHECK (role IN ('USER', 'ADMIN'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- contributor_password_resets — liens temporaires de changement de mot de passe.
-- Le token brut n'est jamais stocké : seule son empreinte SHA-256 est en DB.
-- Le username n'est PAS concerné par ce flux ; seul contributors.password change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contributor_password_resets (
    id             SERIAL PRIMARY KEY,
    contributor_id INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
    token_hash     TEXT UNIQUE NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    used_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_contributor_password_resets_valid
    ON contributor_password_resets (token_hash, expires_at)
    WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- settings — configuration runtime éditable par les admins (/admin/config).
-- 1 clé = 1 réglage (value JSONB typée). Clés allowlistées côté code
-- (lib/queries/settings.ts) : aucune clé dynamique issue du client.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed des défauts (ne pas écraser une valeur déjà réglée par un admin).
-- public_channels : allowlist privacy (le worker n'ingère QUE ces canaux).
-- map_bounds : bornes Réunion (null = carte ouverte). map_min_zoom : plage 0-22.
INSERT INTO settings (key, value) VALUES
    ('misconfig_max_packets_24h', '1000'::jsonb),
    ('public_channels', '["Fr_Balise","Fr_EMCOM","Fr_BlaBla"]'::jsonb),
    ('map_bounds', '{"west":54.7,"south":-21.9,"east":56.3,"north":-20.4}'::jsonb),
    ('map_min_zoom', '8'::jsonb),
    ('legal_info', '{
        "companyName": "À compléter",
        "companyType": "À compléter",
        "companySiret": "À compléter",
        "companyAddress": "À compléter",
        "hostingProvider": "À compléter",
        "hostingLocation": "À compléter"
    }'::jsonb),
    ('mqtt_onboarding', '{
        "mobileBroker": "mqtt.la-forge-numerique.com:1883",
        "webBroker": "91.134.54.125:1883",
        "rootTopic": "msh/EU_868",
        "encryptionEnabled": true,
        "jsonOutputEnabled": true,
        "tlsEnabled": false,
        "mapReportEnabled": true
    }'::jsonb)
ON CONFLICT (key) DO NOTHING;
