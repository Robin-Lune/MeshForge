import { describe, it, expect } from "vitest";
import { controlPoint, quadBezier, bezierApex } from "./link-geometry";

describe("quadBezier", () => {
  it("passe par les extrémités et échantillonne n+1 points", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const c = { x: 5, y: 5 };
    const pts = quadBezier(a, c, b, 8);
    expect(pts).toHaveLength(9);
    expect(pts[0]).toEqual(a);
    expect(pts[8]).toEqual(b);
  });
});

describe("controlPoint", () => {
  it("corde longue : décale le milieu perpendiculairement de l'amplitude de base", () => {
    // corde horizontale longue (>= seuil) -> pas de boost : contrôle en (50, 16).
    const c = controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 16);
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(16);
  });

  it("corde courte (pile) : boucle latérale marquée (dépasse les pastilles)", () => {
    // corde de 20 px -> amplitude fortement gonflée pour sortir des pastilles.
    const c = controlPoint({ x: 0, y: 0 }, { x: 20, y: 0 }, 16);
    expect(Math.abs(c.y)).toBeGreaterThan(40);
  });

  it("corde quasi nulle (pile) : produit un contrôle décalé (arc visible)", () => {
    const c = controlPoint({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, 0);
    // index 0 -> angle -PI/2, rayon 5 : ~ (0, -5), donc bien écarté du point.
    expect(Math.hypot(c.x, c.y)).toBeGreaterThan(4);
  });

  it("corde nulle : index différents -> contrôles différents (éventail)", () => {
    const c0 = controlPoint({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, 0);
    const c1 = controlPoint({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, 1);
    expect(c0.x !== c1.x || c0.y !== c1.y).toBe(true);
  });
});

describe("bezierApex", () => {
  it("renvoie le point à t=0,5 de la bézier", () => {
    const apex = bezierApex({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 });
    expect(apex.x).toBeCloseTo(5);
    expect(apex.y).toBeCloseTo(2.5);
  });
});
