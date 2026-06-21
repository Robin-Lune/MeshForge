import { createHmac, timingSafeEqual } from "node:crypto";

// Session admin minimale, sans dépendance externe : un cookie httpOnly signé
// HMAC-SHA256. Token : `<payload base64url>.<signature>`, payload = JSON des
// claims {sub, exp}. `sub` = username -> permet de re-vérifier le rôle en DB à
// chaque requête (révocation immédiate). Logique pure (Node crypto), testable,
// utilisable côté Server Component / Route Handler (runtime Node, pas Edge).
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

export interface SessionClaims {
  sub: string; // username de l'admin authentifié
  exp: number; // expiration (ms epoch)
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// Signe des claims -> token.
export function signSession(claims: SessionClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

// Token de session pour `sub`, expirant dans SESSION_TTL_MS.
export function newSessionToken(sub: string, now: number, secret: string): string {
  return signSession({ sub, exp: now + SESSION_TTL_MS }, secret);
}

// Vérifie signature ET fraîcheur. Renvoie les claims, ou null si invalide/expiré.
export function verifySession(
  token: string | undefined,
  secret: string,
  now: number,
): SessionClaims | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload, secret));
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof (claims as SessionClaims).sub !== "string" ||
    typeof (claims as SessionClaims).exp !== "number"
  ) {
    return null;
  }
  const c = claims as SessionClaims;
  return c.exp > now ? c : null;
}
