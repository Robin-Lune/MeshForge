// SPDX-License-Identifier: AGPL-3.0-or-later
// Fusion des arêtes du nœud survolé (logique pure, testée).
import type { ObservationSource } from "@/types";

export type HoverEdge = {
  nodeId: string; // l'autre extrémité de l'arête
  hop: number;
  packets: number;
  source: ObservationSource;
};

// Priorité d'affichage quand une même paire est couverte par plusieurs
// sources : l'observation gateway (portée réelle + badge paquets) prime sur le
// saut de traceroute, qui prime sur le voisin déclaré. Une seule ligne par
// paire — sinon les styles se superposeraient.
const SOURCE_PRIORITY: Record<ObservationSource, number> = {
  gateway: 0,
  traceroute: 1,
  neighbor: 2,
};

// Une arête par cible : à source égale, hop minimal et packets maximal
// (comportement historique des observations bidirectionnelles) ; entre
// sources, la plus prioritaire l'emporte.
export function bestTargets(edges: HoverEdge[]): HoverEdge[] {
  const best = new Map<string, HoverEdge>();
  for (const e of edges) {
    const prev = best.get(e.nodeId);
    if (!prev || SOURCE_PRIORITY[e.source] < SOURCE_PRIORITY[prev.source]) {
      best.set(e.nodeId, { ...e });
    } else if (SOURCE_PRIORITY[e.source] === SOURCE_PRIORITY[prev.source]) {
      prev.hop = Math.min(prev.hop, e.hop);
      prev.packets = Math.max(prev.packets, e.packets);
    }
  }
  return [...best.values()];
}
