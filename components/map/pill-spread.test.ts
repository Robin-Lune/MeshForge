import { describe, it, expect } from "vitest";
import { resolvePillSpread, type PillBox } from "./pill-spread";

// Deux pastilles séparées ne doivent pas se chevaucher : |centre_a - centre_b|
// >= (wa+wb)/2 + pad sur au moins un axe (ou (ha+hb)/2 + pad).
function separated(a: PillBox, oa: { dx: number; dy: number }, b: PillBox, ob: { dx: number; dy: number }, pad: number): boolean {
  const dx = Math.abs(b.x + ob.dx - (a.x + oa.dx));
  const dy = Math.abs(b.y + ob.dy - (a.y + oa.dy));
  return dx >= (a.w + b.w) / 2 + pad - 1e-6 || dy >= (a.h + b.h) / 2 + pad - 1e-6;
}

// Aire de recouvrement cumulée entre toutes les paires (0 = pile dispersée).
function overlapArea(boxes: PillBox[], offsets: { dx: number; dy: number }[]): number {
  let total = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = (a.w + b.w) / 2 - Math.abs(b.x + offsets[j].dx - (a.x + offsets[i].dx));
      const oy = (a.h + b.h) / 2 - Math.abs(b.y + offsets[j].dy - (a.y + offsets[i].dy));
      if (ox > 0 && oy > 0) total += ox * oy;
    }
  }
  return total;
}

describe("resolvePillSpread", () => {
  it("laisse une pastille seule à offset zéro", () => {
    expect(resolvePillSpread([{ x: 100, y: 100, w: 40, h: 22 }])).toEqual([
      { dx: 0, dy: 0 },
    ]);
  });

  it("ne bouge pas des pastilles déjà disjointes", () => {
    const boxes: PillBox[] = [
      { x: 0, y: 0, w: 40, h: 22 },
      { x: 200, y: 0, w: 40, h: 22 },
    ];
    expect(resolvePillSpread(boxes)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });

  it("écarte deux pastilles empilées au même point jusqu'à les disjoindre", () => {
    const boxes: PillBox[] = [
      { x: 100, y: 100, w: 40, h: 22 },
      { x: 100, y: 100, w: 40, h: 22 },
    ];
    const [oa, ob] = resolvePillSpread(boxes, 4);
    expect(separated(boxes[0], oa, boxes[1], ob, 4)).toBe(true);
    // Décalage symétrique (poussée répartie de part et d'autre).
    expect(oa.dx + ob.dx).toBeCloseTo(0);
    expect(oa.dy + ob.dy).toBeCloseTo(0);
  });

  it("réduit le recouvrement d'une pile (cas MiK3/PAM/MiK2/MIKL)", () => {
    // 4 nodes quasi-superposés (projetés à ~1 px près, comme sur la carte).
    const boxes: PillBox[] = Array.from({ length: 4 }, (_, i) => ({
      x: 100 + i,
      y: 100 + i,
      w: 40,
      h: 22,
    }));
    const zero = boxes.map(() => ({ dx: 0, dy: 0 }));
    const offsets = resolvePillSpread(boxes, 4);
    // Le passage par défaut (12 itérations) réduit fortement l'empilement.
    expect(overlapArea(boxes, offsets)).toBeLessThan(overlapArea(boxes, zero));
  });

  it("disjoint entièrement une pile quand on laisse converger", () => {
    const boxes: PillBox[] = Array.from({ length: 4 }, (_, i) => ({
      x: 100 + i,
      y: 100 + i,
      w: 40,
      h: 22,
    }));
    const offsets = resolvePillSpread(boxes, 4, 40);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(
          separated(boxes[i], offsets[i], boxes[j], offsets[j], 4),
        ).toBe(true);
      }
    }
  });
});
