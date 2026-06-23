// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { Pool } from "pg";
import { getDbConfig } from "./db-config";

// Pool PostgreSQL partagé par le worker MQTT et l'API Next.js.
// Singleton via globalThis pour éviter une nouvelle Pool à chaque HMR de Next
// en dev. Côté worker (process unique), c'est simplement un singleton.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ?? new Pool(getDbConfig());

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
