import { describe, it, expect } from "vitest";
import { relativeTime } from "./format";

// `now` est injecté pour rester déterministe (pas de Date.now() implicite).
describe("relativeTime — durée écoulée lisible (fr)", () => {
  const now = new Date("2026-06-21T12:00:00.000Z");

  it("renvoie 'jamais' si la date est absente", () => {
    expect(relativeTime(null, now)).toBe("jamais");
  });

  it("affiche 'à l'instant' en dessous d'une minute", () => {
    expect(relativeTime("2026-06-21T11:59:30.000Z", now)).toBe("à l'instant");
  });

  it("affiche les minutes en dessous d'une heure", () => {
    expect(relativeTime("2026-06-21T11:45:00.000Z", now)).toBe("il y a 15 min");
  });

  it("affiche les heures en dessous d'un jour", () => {
    expect(relativeTime("2026-06-21T09:00:00.000Z", now)).toBe("il y a 3 h");
  });

  it("affiche les jours au-delà de 24h", () => {
    expect(relativeTime("2026-06-18T12:00:00.000Z", now)).toBe("il y a 3 j");
  });
});
