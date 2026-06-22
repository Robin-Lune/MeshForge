// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Rate limiting en mémoire (sliding-window log), sans dépendance externe :
// cohérent avec le self-hosting mono-instance (zéro Redis/cloud). Protège les
// routes publiques sensibles : inscription relais + login admin.

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number; // délai avant la prochaine tentative autorisée (0 si OK)
}

// Logique pure (testée). On n'ajoute `now` à la liste QUE si la tentative est
// autorisée -> la liste reste bornée à `limit` et la fenêtre se vide d'elle-même
// `windowMs` après la dernière tentative autorisée (les rejets ne prolongent
// pas le blocage indéfiniment).
export function slidingWindow(
  prevHits: number[],
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; hits: number[]; retryAfterMs: number } {
  const recent = prevHits.filter((t) => now - t < windowMs);
  if (recent.length < limit) {
    return { allowed: true, hits: [...recent, now], retryAfterMs: 0 };
  }
  return {
    allowed: false,
    hits: recent,
    retryAfterMs: recent[0] + windowMs - now,
  };
}

// Premier IP de X-Forwarded-For (réécrit par le reverse-proxy de confiance),
// repli X-Real-IP, puis "unknown". En prod un proxy maîtrisé pose ces en-têtes ;
// sans proxy tout le monde partage "unknown" (limite globale, fail-safe).
export function clientIp(xff: string | null, xRealIp: string | null): string {
  const first = xff?.split(",")[0]?.trim();
  return first || xRealIp?.trim() || "unknown";
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitDecision;
}

// Limiteur avec état (Map clé -> timestamps). Balayage périodique pour purger
// les clés inactives et borner la mémoire.
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;
  return {
    check(key, now = Date.now()): RateLimitDecision {
      if (now - lastSweep >= opts.windowMs) {
        for (const [k, ts] of hits) {
          if (ts.every((t) => now - t >= opts.windowMs)) hits.delete(k);
        }
        lastSweep = now;
      }
      const res = slidingWindow(
        hits.get(key) ?? [],
        now,
        opts.limit,
        opts.windowMs,
      );
      hits.set(key, res.hits);
      return { allowed: res.allowed, retryAfterMs: res.retryAfterMs };
    },
  };
}
