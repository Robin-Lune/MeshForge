-- MeshForge — Schéma initial (Phase 1)
-- Implémente .claude/docs/schema-db.md. Exécuté automatiquement par l'image
-- TimescaleDB au premier démarrage (monté dans /docker-entrypoint-initdb.d).

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- packets — hypertable principale. Une ligne = un paquet capté par un relais.
-- rssi/snr = qualité du DERNIER hop (relais -> nous), pas de l'émetteur
-- d'origine : ne pas mal interpréter pour la heatmap (cf. reseau-meshtastic).
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
-- Privacy (cf. CLAUDE.md) :
--   is_mobile = true    -> jamais affiché sur la carte publique
--   share_on_map = false (défaut) -> node fixe non affiché sans consentement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodes (
    node_id       TEXT PRIMARY KEY,
    long_name     TEXT,
    short_name    TEXT,
    hw_model      TEXT,                       -- ex: HELTEC_V4
    firmware      TEXT,
    role          TEXT,                       -- CLIENT / ROUTER / ROUTER_CLIENT / etc.
    is_mobile     BOOLEAN DEFAULT FALSE,      -- mobile = jamais sur la carte publique
    last_lat      DOUBLE PRECISION,
    last_lon      DOUBLE PRECISION,
    last_battery  SMALLINT,
    last_seen     TIMESTAMPTZ,
    first_seen    TIMESTAMPTZ DEFAULT NOW(),
    share_on_map  BOOLEAN DEFAULT FALSE       -- opt-in explicite pour la carte publique
);

-- ---------------------------------------------------------------------------
-- contributors — auth MQTT en production (mosquitto-go-auth, Phase 5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contributors (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,                -- bcrypt hash du token
    email       TEXT,
    node_name   TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
