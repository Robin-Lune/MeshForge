import { describe, it, expect } from "vitest";
import { nodeIdentityLine, popupNodeId, relativeTime } from "./format";

describe("nodeIdentityLine — ligne secondaire des listes de nodes", () => {
  it("préfixe l'ID par le nom court quand nom long ET nom court existent", () => {
    expect(nodeIdentityLine("Test Un", "T1", "!11111111")).toBe(
      "T1 · !11111111",
    );
  });

  it("ID seul sans nom court (rien à préfixer)", () => {
    expect(nodeIdentityLine("Test Un", null, "!11111111")).toBe("!11111111");
  });

  it("ID seul sans nom long (le titre affiche déjà le nom court)", () => {
    expect(nodeIdentityLine(null, "T1", "!11111111")).toBe("!11111111");
  });

  it("ID seul quand le node n'a aucun nom", () => {
    expect(nodeIdentityLine(null, null, "!11111111")).toBe("!11111111");
  });
});

describe("popupNodeId — ID sous le titre du popup carte", () => {
  it("renvoie l'ID quand le titre est un nom", () => {
    expect(popupNodeId("Test Un", "!11111111")).toBe("!11111111");
  });

  it("null quand le titre est déjà l'ID (node sans nom, pas de doublon)", () => {
    expect(popupNodeId("!11111111", "!11111111")).toBeNull();
  });

  it("null quand l'ID est absent", () => {
    expect(popupNodeId("Test Un", "")).toBeNull();
  });
});

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
