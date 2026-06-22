// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
// Tri client de la liste des nodes (/nodes). Logique pure, sans accès DB :
// importable côté composant client ET testable isolément.
import type { NodeListItem } from "../types";

export type SortKey =
  | "name"
  | "role"
  | "hwModel"
  | "batteryPct"
  | "packets24h"
  | "lastSeen";
export type SortDir = "asc" | "desc";

// Nom affiché : longName, sinon shortName, sinon le nodeId (jamais null).
const displayName = (n: NodeListItem): string =>
  n.longName ?? n.shortName ?? n.nodeId;

// Valeur comparable d'une ligne pour une colonne. null = inconnu (batterie/rôle/
// carte/vu absents) → ramené EN DERNIER par le comparateur, quel que soit le sens.
function sortValue(n: NodeListItem, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return displayName(n);
    case "role":
      return n.role;
    case "hwModel":
      return n.hwModel;
    case "batteryPct":
      return n.batteryPct;
    case "packets24h":
      return n.packets24h;
    case "lastSeen":
      return n.lastSeen ? Date.parse(n.lastSeen) : null;
  }
}

// Tri non destructif (copie). Les valeurs inconnues (null) finissent TOUJOURS en
// dernier : trier ne doit pas remonter les trous en tête de liste.
export function sortNodeList(
  items: NodeListItem[],
  key: SortKey,
  dir: SortDir,
): NodeListItem[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const base =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "fr", { sensitivity: "base" });
    return sign * base;
  });
}
