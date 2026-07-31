// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Couleur d'un marker = FRAÎCHEUR du node (date de dernière réception).
//
// Avant, la teinte était un hash du node_id : stable, mais sans aucun sens
// réseau — elle occupait le canal visuel le plus fort de la carte pour ne rien
// transporter. Elle encode désormais le seul critère qui décide vraiment quand
// on cherche où poser un relais : « ce node répond-il encore ? ».
//
// Rampe bleue qui se désature en vieillissant. Deux couleurs de texte, choisies
// PALIER PAR PALIER : une couleur unique plafonnait en AA. Chaque paire
// fond/texte est mesurée >= 7:1 (WCAG AAA) — cf. nodeColor.test.ts, qui
// recalcule les ratios et échouerait si un palier était retouché à l'aveugle.
//
// Le dernier palier s'arrête à #b1b6b9 et ne continue PAS vers le blanc : plus
// clair, la pastille se confond avec la tuile et « très vieux » se lirait
// « absent » — le contresens que la légende de couverture interdit déjà pour
// les zones non explorées.

// Vert Meshtastic. N'est plus la couleur de fond d'une passerelle (elle porte
// désormais la fraîcheur comme les autres) mais celle de son badge compteur,
// et celle d'un cluster contenant une passerelle.
export const GATEWAY_COLOR = "#67EA94";
export const GATEWAY_INK = "#064e3b";

export type PillColor = { bg: string; fg: string };

export type FreshnessStep = {
  /** Borne HAUTE exclusive, en heures. Infinity pour le dernier palier. */
  maxHours: number;
  label: string;
} & PillColor;

// Ordre STRICT : le premier palier dont maxHours est dépassé gagne.
export const FRESHNESS_STEPS: readonly FreshnessStep[] = [
  { maxHours: 1, bg: "#0951a5", fg: "#ffffff", label: "Moins d'une heure" },
  { maxHours: 24, bg: "#7bade0", fg: "#0f1c2e", label: "Moins de 24 h" },
  { maxHours: 24 * 7, bg: "#a0bacf", fg: "#0f1c2e", label: "Moins de 7 jours" },
  { maxHours: 24 * 14, bg: "#bec8d0", fg: "#0f1c2e", label: "Moins de 14 jours" },
  { maxHours: Infinity, bg: "#b1b6b9", fg: "#0f1c2e", label: "Plus de 14 jours" },
] as const;

const OLDEST = FRESHNESS_STEPS[FRESHNESS_STEPS.length - 1];

// `lastSeen` absent/illisible → palier le plus ancien plutôt qu'un état
// distinct : un node affiché a TOUJOURS une date (les deux chemins d'écriture
// posent last_seen, et getPublicNodes filtre sur la position). Un « jamais vu »
// serait une entrée de légende morte. Une date future (horloge décalée d'un
// node) donne un âge négatif : traitée comme la plus fraîche, pas comme une
// anomalie à signaler.
export function freshnessColor(
  lastSeen: string | null | undefined,
  now: number = Date.now(),
): PillColor {
  if (!lastSeen) return { bg: OLDEST.bg, fg: OLDEST.fg };
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return { bg: OLDEST.bg, fg: OLDEST.fg };

  const hours = (now - t) / 3_600_000;
  // On ne parcourt que les paliers BORNÉS et on retombe explicitement sur le
  // dernier. Boucler sur toute la table imposerait un `return` de secours après
  // la boucle que rien ne peut atteindre (le dernier palier borne à Infinity) —
  // donc une branche morte, impossible à couvrir par un test honnête.
  for (let i = 0; i < FRESHNESS_STEPS.length - 1; i++) {
    const step = FRESHNESS_STEPS[i];
    if (hours < step.maxHours) return { bg: step.bg, fg: step.fg };
  }
  return { bg: OLDEST.bg, fg: OLDEST.fg };
}
