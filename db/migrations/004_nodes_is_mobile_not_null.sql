-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Robin Lebon — La Forge Numérique

-- Défaut prudent pour les bases existantes : une valeur NULL ne doit jamais
-- permettre l'affichage d'une position exacte.
UPDATE nodes SET is_mobile = TRUE WHERE is_mobile IS NULL;
ALTER TABLE nodes ALTER COLUMN is_mobile SET DEFAULT TRUE;
ALTER TABLE nodes ALTER COLUMN is_mobile SET NOT NULL;
