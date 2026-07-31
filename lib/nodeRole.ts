// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
export type RoleBadge = { letter: string; title: string };

// Source de vérité de la capsule de rôle : la légende itère cette table, donc
// une lettre ajoutée ici y apparaît sans intervention (cf. MapLegend.test.tsx).
export const ROLE_BADGES: readonly RoleBadge[] = [
  { letter: "R", title: "Relaie le trafic (routeur ou répéteur)" },
  { letter: "C", title: "Capteur — publie de la télémétrie" },
  { letter: "T", title: "Tracker — position mobile par nature" },
  { letter: "?", title: "Rôle inconnu du décodeur" },
] as const;

const [RELAIS_BADGE, CAPTEUR_BADGE, TRACKER_BADGE, INCONNU_BADGE] = ROLE_BADGES;

const RELAIS = new Set(["ROUTER", "ROUTER_CLIENT", "ROUTER_LATE", "REPEATER"]);
const TRACKERS = new Set(["TRACKER", "TAK_TRACKER", "TAK"]);
// Rôles connus SANS capsule. CLIENT est le défaut Meshtastic : une capsule s'y
// poserait sur la quasi-totalité du parc et ne distinguerait plus rien.
const CLIENTS = new Set([
  "CLIENT",
  "CLIENT_MUTE",
  "CLIENT_BASE",
  "CLIENT_HIDDEN",
]);

// Rôle hors catalogue → « ? » : deviceRoleName() renvoie la valeur brute pour un
// enum inconnu, qui passerait sinon pour un client ordinaire.
export function roleBadge(role: string | null | undefined): RoleBadge | null {
  const r = role?.trim().toUpperCase();
  if (!r) return null;
  if (CLIENTS.has(r)) return null;
  if (RELAIS.has(r)) return RELAIS_BADGE;
  if (r === "SENSOR") return CAPTEUR_BADGE;
  if (TRACKERS.has(r)) return TRACKER_BADGE;
  return INCONNU_BADGE;
}
