import { describe, it, expect } from "vitest";
import { slidingWindow, clientIp, createRateLimiter } from "./rate-limit";

describe("slidingWindow", () => {
  it("autorise quand la liste est vide", () => {
    const r = slidingWindow([], 1000, 3, 10_000);
    expect(r.allowed).toBe(true);
    expect(r.hits).toEqual([1000]);
    expect(r.retryAfterMs).toBe(0);
  });

  it("autorise jusqu'à la limite incluse", () => {
    const r = slidingWindow([100, 200], 300, 3, 10_000);
    expect(r.allowed).toBe(true);
    expect(r.hits).toEqual([100, 200, 300]);
  });

  it("bloque une fois la limite atteinte", () => {
    const r = slidingWindow([100, 200, 300], 400, 3, 10_000);
    expect(r.allowed).toBe(false);
    expect(r.hits).toEqual([100, 200, 300]); // pas d'ajout quand bloqué
  });

  it("calcule retryAfterMs depuis le plus ancien hit", () => {
    // plus ancien = 100, fenêtre 10_000 -> dispo à 10_100, maintenant 400
    const r = slidingWindow([100, 200, 300], 400, 3, 10_000);
    expect(r.retryAfterMs).toBe(9700);
  });

  it("oublie les hits sortis de la fenêtre", () => {
    // 100 est hors fenêtre à 10_150 (150 > 100+10_000 ? non) -> on prend > window
    const r = slidingWindow([100, 200, 300], 10_150, 3, 10_000);
    // 100 est sorti (10_150-100 = 10_050 >= 10_000), restent 200,300 -> autorisé
    expect(r.allowed).toBe(true);
    expect(r.hits).toEqual([200, 300, 10_150]);
  });
});

describe("clientIp", () => {
  it("prend le premier IP de X-Forwarded-For", () => {
    expect(clientIp("1.2.3.4, 5.6.7.8", null)).toBe("1.2.3.4");
  });

  it("nettoie les espaces", () => {
    expect(clientIp("  9.9.9.9 ", null)).toBe("9.9.9.9");
  });

  it("se rabat sur X-Real-IP", () => {
    expect(clientIp(null, "10.0.0.1")).toBe("10.0.0.1");
  });

  it('renvoie "unknown" sans en-tête', () => {
    expect(clientIp(null, null)).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("autorise limit fois puis bloque", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 10).allowed).toBe(true);
    expect(rl.check("ip", 20).allowed).toBe(false);
  });

  it("isole les clés indépendamment", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 0).allowed).toBe(false);
  });

  it("se réinitialise après la fenêtre", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 500).allowed).toBe(false);
    expect(rl.check("ip", 1000).allowed).toBe(true);
  });
});
