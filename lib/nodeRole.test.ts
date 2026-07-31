import { describe, it, expect } from "vitest";
import { roleBadge } from "./nodeRole";

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
    // CLIENT est le défaut Meshtastic : un badge s'y poserait sur presque tout
    // le parc et ne distinguerait plus rien. L'absence de badge EST le signal.
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
    // deviceRoleName() renvoie la valeur brute pour un enum inconnu : un
    // firmware plus récent que le décodeur ne doit pas passer pour un client.
    const badge = roleBadge("42");
    expect(badge?.letter).toBe("?");
    expect(badge?.title).toContain("42");
    expect(roleBadge("LOST_AND_FOUND")?.letter).toBe("?");
  });

  it("tolère la casse et les espaces", () => {
    expect(roleBadge(" router ")?.letter).toBe("R");
    expect(roleBadge("sensor")?.letter).toBe("C");
  });
});
