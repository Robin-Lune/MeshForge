// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique

// Une pastille projetée en pixels écran : centre (x, y) + dimensions (w, h).
export interface PillBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Décalage pixel appliqué à une pastille pour la sortir de la pile.
export interface PillOffset {
  dx: number;
  dy: number;
}

// Résout les recouvrements d'une pile de pastilles superposées (même position
// géographique) en les écartant en pixels. Renvoie un offset par pastille,
// aligné sur l'index d'entrée. Purement géométrique : le popup doit ensuite
// ancrer sur `centre + offset` pour suivre la pastille réellement survolée.
export function resolvePillSpread(
  boxes: PillBox[],
  pad = 4,
  iterations = 12,
): PillOffset[] {
  const items = boxes.map((b) => ({ ...b, dx: 0, dy: 0 }));
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const dx = b.x + b.dx - (a.x + a.dx);
        const dy = b.y + b.dy - (a.y + a.dy);
        const ox = (a.w + b.w) / 2 + pad - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + pad - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const push = ox * (dx < 0 ? -1 : 1);
          a.dx -= push / 2;
          b.dx += push / 2;
        } else {
          const push = oy * (dy < 0 ? -1 : 1);
          a.dy -= push / 2;
          b.dy += push / 2;
        }
      }
    }
    if (!moved) break;
  }
  return items.map((it) => ({ dx: it.dx, dy: it.dy }));
}
