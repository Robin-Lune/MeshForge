import { describe, it, expect } from "vitest";
import { signSession, verifySession, newSessionToken, SESSION_TTL_MS } from "./auth";

const SECRET = "test-secret-please-change";
const NOW = 1_700_000_000_000;

describe("signSession / verifySession — cookie de session admin (HMAC)", () => {
  it("vérifie un token fraîchement signé", () => {
    const token = signSession(NOW + 1000, SECRET);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
  });

  it("rejette un token absent", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBe(false);
    expect(verifySession("", SECRET, NOW)).toBe(false);
  });

  it("rejette un token expiré", () => {
    const token = signSession(NOW - 1, SECRET);
    expect(verifySession(token, SECRET, NOW)).toBe(false);
  });

  it("rejette une signature falsifiée", () => {
    const token = signSession(NOW + 1000, SECRET);
    const tampered = token.slice(0, -2) + "xy";
    expect(verifySession(tampered, SECRET, NOW)).toBe(false);
  });

  it("rejette un payload modifié (expiration repoussée)", () => {
    const token = signSession(NOW + 1000, SECRET);
    const sig = token.slice(token.lastIndexOf("."));
    const forged = `${NOW + 999_999}${sig}`;
    expect(verifySession(forged, SECRET, NOW)).toBe(false);
  });

  it("rejette un token signé avec un autre secret", () => {
    const token = signSession(NOW + 1000, "autre-secret");
    expect(verifySession(token, SECRET, NOW)).toBe(false);
  });

  it("rejette une forme invalide (pas de séparateur)", () => {
    expect(verifySession("nimportequoi", SECRET, NOW)).toBe(false);
  });
});

describe("newSessionToken — token avec TTL", () => {
  it("produit un token valide expirant dans SESSION_TTL_MS", () => {
    const token = newSessionToken(NOW, SECRET);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_MS + 1)).toBe(false);
  });
});
