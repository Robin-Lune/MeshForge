import { describe, it, expect } from "vitest";
import { haversineKm } from "./geo";

describe("haversineKm", () => {
  it("retourne 0 pour deux points identiques", () => {
    expect(haversineKm(-20.9, 55.5, -20.9, 55.5)).toBe(0);
  });

  it("≈ 111 km pour 1° de latitude", () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 0);
  });

  it("calcule la distance St-Denis ↔ St-Pierre (Réunion, ~50 km à vol d'oiseau)", () => {
    // St-Denis ≈ (-20.8789, 55.4481) ; St-Pierre ≈ (-21.3393, 55.4781)
    const d = haversineKm(-20.8789, 55.4481, -21.3393, 55.4781);
    expect(d).toBeGreaterThan(48);
    expect(d).toBeLessThan(54);
  });
});
