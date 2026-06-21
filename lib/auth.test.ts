import { describe, it, expect } from "vitest";
import { signSession, verifySession, newSessionToken, SESSION_TTL_MS } from "./auth";

const SECRET = "test-secret-please-change";
const NOW = 1_700_000_000_000;

describe("signSession / verifySession — cookie de session admin (HMAC)", () => {
  it("renvoie les claims pour un token fraîchement signé", () => {
    const token = signSession({ sub: "robin", exp: NOW + 1000 }, SECRET);
    expect(verifySession(token, SECRET, NOW)).toEqual({ sub: "robin", exp: NOW + 1000 });
  });

  it("renvoie null pour un token absent", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBeNull();
    expect(verifySession("", SECRET, NOW)).toBeNull();
  });

  it("renvoie null pour un token expiré", () => {
    const token = signSession({ sub: "robin", exp: NOW - 1 }, SECRET);
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("renvoie null pour une signature falsifiée", () => {
    const token = signSession({ sub: "robin", exp: NOW + 1000 }, SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifySession(tampered, SECRET, NOW)).toBeNull();
  });

  it("renvoie null si le payload est modifié (sig ne correspond plus)", () => {
    const token = signSession({ sub: "robin", exp: NOW + 1000 }, SECRET);
    const sig = token.slice(token.lastIndexOf("."));
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "robin", exp: NOW + 999_999 }),
    ).toString("base64url");
    expect(verifySession(`${forgedPayload}${sig}`, SECRET, NOW)).toBeNull();
  });

  it("renvoie null pour un token signé avec un autre secret", () => {
    const token = signSession({ sub: "robin", exp: NOW + 1000 }, "autre-secret");
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("renvoie null pour une forme invalide (pas de séparateur)", () => {
    expect(verifySession("nimportequoi", SECRET, NOW)).toBeNull();
  });
});

describe("newSessionToken — token avec sub + TTL", () => {
  it("encode le sub et expire dans SESSION_TTL_MS", () => {
    const token = newSessionToken("robin", NOW, SECRET);
    expect(verifySession(token, SECRET, NOW)?.sub).toBe("robin");
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_MS + 1)).toBeNull();
  });
});
