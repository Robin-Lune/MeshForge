// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { config } from "dotenv";

// Le worker est un process Node autonome (hors Next.js) : il charge ses vars
// lui-même. On reproduit la précédence de Next.js — .env.local d'abord (gagne,
// car dotenv n'écrase pas une var déjà définie), puis .env en valeurs de repli
// (partagées avec docker compose). Ce module doit être importé EN PREMIER dans
// le worker, avant lib/db qui construit la Pool avec DATABASE_URL dès son éval.
config({ path: ".env.local" });
config({ path: ".env" });
