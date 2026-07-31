import { describe, it, expect } from "vitest";
import { ROLE_BADGES, roleBadge } from "./nodeRole";

describe("roleBadge", () => {
  it("marque d'un R tout ce qui relaie", () => {
    for (const r of ["ROUTER", "ROUTER_CLIENT", "ROUTER_LATE", "REPEATER"]) {
      expect(roleBadge(r)?.letter).toBe("R");
    }
  });

  it("marque les capteurs et les trackers", () => {
    expect(roleBadge("SENSOR")?.letter).toBe("C");
    expect(roleBadge("TRACKER")?.letter).toBe("T");
    expect(roleBadge("TAK_TRACKER")?.letter).toBe("T");
    expect(roleBadge("TAK")?.letter).toBe("T");
  });

  it("ne marque AUCUN node de la famille CLIENT", () => {
    // CLIENT est le défaut Meshtastic : l'absence de capsule EST le signal.
    for (const r of [
      "CLIENT",
      "CLIENT_MUTE",
      "CLIENT_BASE",
      "CLIENT_HIDDEN",
    ]) {
      expect(roleBadge(r)).toBeNull();
    }
  });

  it("ne marque rien quand le rôle est absent", () => {
    expect(roleBadge(null)).toBeNull();
    expect(roleBadge(undefined)).toBeNull();
    expect(roleBadge("   ")).toBeNull();
  });

  it("signale un rôle hors catalogue plutôt que de le taire", () => {
    // deviceRoleName() renvoie la valeur brute pour un enum inconnu.
    expect(roleBadge("42")?.letter).toBe("?");
    expect(roleBadge("LOST_AND_FOUND")?.letter).toBe("?");
  });

  it("n'expose que des entrées présentes dans ROLE_BADGES", () => {
    // La légende itère ROLE_BADGES : une lettre produite hors de cette table
    // n'y serait jamais documentée.
    for (const role of ["ROUTER", "SENSOR", "TRACKER", "42"]) {
      expect(ROLE_BADGES).toContain(roleBadge(role));
    }
  });

  it("tolère la casse et les espaces", () => {
    expect(roleBadge(" router ")?.letter).toBe("R");
    expect(roleBadge("sensor")?.letter).toBe("C");
  });
});
