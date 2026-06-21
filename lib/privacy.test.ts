import { describe, it, expect } from "vitest";
import { isPubliclyVisible, snapToGrid } from "./privacy";

// Public par défaut : un node localisé est visible (fixe OU mobile — le mobile
// est flouté par snapToGrid au moment de l'exposition). Caché seulement sans position.
describe("isPubliclyVisible", () => {
  it("affiche un node fixe localisé", () => {
    expect(isPubliclyVisible({ lat: -21.1, lon: 55.5 })).toBe(true);
  });

  it("affiche un node mobile localisé (position snappée ailleurs)", () => {
    expect(isPubliclyVisible({ lat: -21.1, lon: 55.5 })).toBe(true);
  });

  it("masque un node sans position", () => {
    expect(isPubliclyVisible({ lat: null, lon: 55.5 })).toBe(false);
    expect(isPubliclyVisible({ lat: -21.1, lon: null })).toBe(false);
  });
});

// Flou CONSTANT ~500 m pour les mobiles (cf. .claude/docs/privacy-rgpd.md) :
// deux positions dans la même cellule → même sortie (impossible à moyenner).
describe("snapToGrid", () => {
  it("est déterministe : deux positions proches → même cellule", () => {
    expect(snapToGrid(-21.1156, 55.536)).toEqual(snapToGrid(-21.1157, 55.5361));
  });

  it("ne renvoie pas la position exacte (floutée)", () => {
    expect(snapToGrid(-21.1, 55.5).lat).not.toBe(-21.1);
  });

  it("reste à moins d'une cellule (~500 m) de l'exact", () => {
    const s = snapToGrid(-21.1, 55.5);
    expect(Math.abs(s.lat - -21.1)).toBeLessThan(0.0045);
    expect(Math.abs(s.lon - 55.5)).toBeLessThan(0.0045);
  });
});
