// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
// Logique pure de la rétention : comparer le réglage `retention_days` à la
// politique TimescaleDB en place. Les requêtes vivent dans lib/queries/retention.ts.

// `config->>'drop_after'` d'un job TimescaleDB est un intervalle Postgres en
// texte. Seule la forme « N day(s) » est comparable sans ambiguïté ; « 2 mons »
// ou « 1 mon 5 days » n'ont pas de longueur fixe en jours -> null.
const DAYS_RE = /^\s*(\d+)\s+days?\s*$/;

export function parseIntervalDays(
  text: string | null | undefined,
): number | null {
  if (!text) return null;
  const m = DAYS_RE.exec(text);
  return m ? Number(m[1]) : null;
}

// Recréer une politique repousse sa prochaine exécution : on ne le fait que si
// elle diffère vraiment du réglage (ou si elle manque / est illisible).
export function retentionPolicyNeedsUpdate(
  currentDropAfter: string | null | undefined,
  days: number,
): boolean {
  return parseIntervalDays(currentDropAfter) !== days;
}
