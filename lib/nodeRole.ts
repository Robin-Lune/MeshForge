// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Badge de rôle d'un marker : une lettre dans un pastillon encre.
//
// Le catalogue Meshtastic compte 13 rôles (src/worker/meshtastic/enums.ts) ;
// les distinguer tous sur 14 px est illisible. À l'échelle de la carte, le fait
// actionnable est « ce node relaie / mesure / bouge » — le rôle exact reste
// dans l'infobulle et dans la fiche node.
//
// La famille CLIENT ne reçoit AUCUN badge, et c'est délibéré : CLIENT est le
// défaut Meshtastic (les parseurs y retombent explicitement quand le champ est
// absent du fil), donc un badge s'y poserait sur la quasi-totalité du parc et
// ne distinguerait plus rien. L'absence de badge devient l'information.

export type RoleBadge = { letter: string; title: string };

const RELAIS = new Set([
  "ROUTER",
  "ROUTER_CLIENT",
  "ROUTER_LATE",
  "REPEATER",
]);
const TRACKERS = new Set(["TRACKER", "TAK_TRACKER"]);
// Rôles connus SANS badge : nœuds ordinaires.
const CLIENTS = new Set([
  "CLIENT",
  "CLIENT_MUTE",
  "CLIENT_BASE",
  "CLIENT_HIDDEN",
]);

// Rôle absent → pas de badge (on n'invente pas un CLIENT implicite ici : la
// donnée peut simplement ne pas être encore remontée).
// Rôle hors catalogue → badge « ? » : deviceRoleName() renvoie la valeur brute
// pour un enum inconnu, donc un firmware plus récent que le décodeur produit
// une chaîne quelconque. Sans ce cas, elle passerait pour un client ordinaire.
export function roleBadge(role: string | null | undefined): RoleBadge | null {
  const r = role?.trim().toUpperCase();
  if (!r) return null;
  if (CLIENTS.has(r)) return null;
  if (RELAIS.has(r)) return { letter: "R", title: "Relaie le trafic" };
  if (r === "SENSOR") return { letter: "C", title: "Capteur" };
  if (TRACKERS.has(r)) return { letter: "T", title: "Tracker" };
  if (r === "TAK") return { letter: "T", title: "TAK" };
  if (r === "LOST_AND_FOUND") return { letter: "?", title: "Rôle inhabituel" };
  return { letter: "?", title: `Rôle hors catalogue : ${role}` };
}
