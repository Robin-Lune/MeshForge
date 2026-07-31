// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Colorimétrie pour les TESTS. Recalculer les ratios plutôt que figer les
// couleurs attendues fait échouer la suite quand quelqu'un retouche une teinte à
// l'œil. Un seul exemplaire : les copies divergeaient sur le seuil de
// linéarisation sRGB, qui vaut 0,04045.

type Rgb = [number, number, number];

export const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

const linear = (v: number): number => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (c: Rgb): number => {
  const [r, g, b] = c.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Ratio WCAG 2.1, de 1 à 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Compose une couleur semi-transparente sur un fond opaque. */
export function over(rgba: [number, number, number, number], bg: string): string {
  const back = rgb(bg);
  const mix = [0, 1, 2].map((i) =>
    Math.round(rgba[3] * rgba[i] + (1 - rgba[3]) * back[i]),
  );
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const lab = (c: Rgb): Rgb => {
  const [r, g, b] = c.map(linear);
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.9505;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.089;
  const k = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * k(Y) - 16, 500 * (k(X) - k(Y)), 200 * (k(Y) - k(Z))];
};

/** Distance perceptuelle CIE76 : ~2 = limite du perceptible, 10 = franc. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(rgb(a));
  const [l2, a2, b2] = lab(rgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
