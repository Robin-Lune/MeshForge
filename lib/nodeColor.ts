// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
// Couleur d'un marker = fraîcheur du node. Les paires fond/texte sont vérifiées
// en contraste par nodeColor.test.ts : ne pas retoucher une teinte sans le
// relancer.
export const GATEWAY_COLOR = "#67EA94";
export const GATEWAY_INK = "#064e3b";

export type PillColor = { bg: string; fg: string };

export type FreshnessStep = {
  maxHours: number; // borne haute EXCLUSIVE ; Infinity sur le dernier palier
  label: string;
} & PillColor;

// Trié par borne CROISSANTE : le premier palier non atteint gagne. Le dernier
// doit rester à Infinity.
export const FRESHNESS_STEPS: readonly FreshnessStep[] = [
  // Bornes STRICTES (hours < maxHours), d'où « < » et non « ≤ ». Le dernier
  // palier récupère l'égalité, d'où « ≥ ».
  { maxHours: 1, bg: "#0951a5", fg: "#ffffff", label: "< 1 h" },
  { maxHours: 24, bg: "#7bade0", fg: "#0f1c2e", label: "< 24 h" },
  { maxHours: 24 * 7, bg: "#a0bacf", fg: "#0f1c2e", label: "< 7 j" },
  { maxHours: 24 * 14, bg: "#bec8d0", fg: "#0f1c2e", label: "< 14 j" },
  { maxHours: Infinity, bg: "#b1b6b9", fg: "#0f1c2e", label: "≥ 14 j" },
] as const;

const OLDEST = FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1];

// Date absente ou illisible → palier le plus ancien. Cas atteignable :
// NodeUpdate.lastSeen est nullable et le flux temps réel écrit alors "".
export function freshnessColor(
  lastSeen: string | null | undefined,
  now: number = Date.now(),
): PillColor {
  if (!lastSeen) return { bg: OLDEST.bg, fg: OLDEST.fg };
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return { bg: OLDEST.bg, fg: OLDEST.fg };

  const hours = (now - t) / 3_600_000;
  // Ne parcourt que les paliers bornés : boucler sur toute la table imposerait
  // après elle un return inatteignable.
  for (let i = 0; i < FRESHNESS_STEPS.length - 1; i++) {
    const step = FRESHNESS_STEPS[i];
    if (hours < step.maxHours) return { bg: step.bg, fg: step.fg };
  }
  return { bg: OLDEST.bg, fg: OLDEST.fg };
}
