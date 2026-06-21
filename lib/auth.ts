import { createHmac, timingSafeEqual } from "node:crypto";

// Session admin minimale, sans dépendance externe : un cookie httpOnly signé
// HMAC-SHA256. Format du token : `<expiresAt>.<signature base64url>`.
// Logique pure (Node crypto) -> testable et utilisable côté Server Component /
// Route Handler (runtime Node, pas Edge). Pas de middleware Edge (crypto absent).
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// Signe un token expirant à `expiresAt` (ms epoch).
export function signSession(expiresAt: number, secret: string): string {
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, secret)}`;
}

// Token de session courant (expire dans SESSION_TTL_MS).
export function newSessionToken(now: number, secret: string): string {
  return signSession(now + SESSION_TTL_MS, secret);
}

// Vérifie signature ET fraîcheur. Comparaison constante (timingSafeEqual).
export function verifySession(
  token: string | undefined,
  secret: string,
  now: number,
): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload, secret));
  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
