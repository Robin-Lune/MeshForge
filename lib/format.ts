// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
// Formatage partagé (logique pure, testée). `now` est toujours injecté pour
// rester déterministe — jamais de Date.now() implicite dans ces helpers.

// Ligne secondaire d'identité d'un node (listes) : "SHORT · !id" quand le nom
// court complète un nom long affiché en titre, sinon l'ID seul (sans nom long,
// le titre affiche déjà le nom court ou l'ID — pas de doublon).
export function nodeIdentityLine(
  longName: string | null,
  shortName: string | null,
  nodeId: string,
): string {
  return longName && shortName ? `${shortName} · ${nodeId}` : nodeId;
}

// ID à afficher sous le titre du popup carte ; null si absent ou redondant
// avec le titre (node sans nom : le titre est déjà l'ID).
export function popupNodeId(title: string, nodeId: string): string | null {
  return nodeId && nodeId !== title ? nodeId : null;
}

// Durée écoulée depuis `iso` jusqu'à `now`, en français court.
export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "jamais";
  const sec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
