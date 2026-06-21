import { describe, it, expect } from "vitest";
import { isPubliclyVisible } from "./privacy";

// Politique : PUBLIC PAR DÉFAUT (cf. .claude/docs/privacy-rgpd.md). Un node fixe
// localisé est visible sans opt-in. Les mobiles restent masqués TANT QUE le snap
// ~1,5 km n'est pas implémenté.
const base = { isMobile: false, lat: -21.1, lon: 55.5 };

describe("isPubliclyVisible — public par défaut", () => {
  it("affiche un node fixe localisé (pas besoin d'opt-in explicite)", () => {
    expect(isPubliclyVisible(base)).toBe(true);
  });

  it("masque un node mobile (snap ~1,5 km pas encore implémenté)", () => {
    expect(isPubliclyVisible({ ...base, isMobile: true })).toBe(false);
  });

  it("masque un node sans position", () => {
    expect(isPubliclyVisible({ ...base, lat: null })).toBe(false);
    expect(isPubliclyVisible({ ...base, lon: null })).toBe(false);
  });
});
