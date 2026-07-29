-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Robin Lebon — La Forge Numérique
-- Ajoute les liens temporaires de changement de mot de passe contributeur.
-- Idempotente : peut être rejouée sur une base existante.

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
