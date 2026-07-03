// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Fonctions PURES du diagnostic « Voisinage réseau » (fiche node) : mise en
// forme et construction des features GeoJSON de la mini-carte. Extraites du
// composant React pour être testables sans DOM ni MapLibre.
import type { TracerouteHop } from "../types";
import { signalColor } from "./map/signal-color";

export const SUBJECT_COLOR = "#2563eb"; // couleur du node consulté

export type SubjectNode = {
  nodeId: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
};

// Forme minimale d'un nœud tracé sur la mini-carte (voisin OU lien).
export type MapNode = {
  nodeId: string;
  name: string | null;
  snr: number | null;
  lat: number | null;
  lon: number | null;
};

// 4 derniers hex du NodeID (ex: "!f669cf14" -> "cf14").
export const shortId = (id: string): string => id.replace(/^!/, "").slice(-4);

// Libellé lisible : nom si présent (non vide), sinon short id.
export const nodeLabel = (id: string, name: string | null): string =>
  name?.trim() || shortId(id);

export const fmtSnr = (s: number | null): string => (s == null ? "— dB" : `${s} dB`);

// Voisins avec position (les seuls traçables sur la carte).
export const locatedNeighbors = (links: MapNode[]): MapNode[] =>
  links.filter((n) => n.lat != null && n.lon != null);

// Liens sujet -> voisin, colorés par SNR ; `dim` = estompé si un AUTRE voisin
// est survolé (hoveredId non null et différent).
export function buildLinkFeatures(
  node: SubjectNode,
  located: MapNode[],
  hoveredId: string | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: located.map((n) => ({
      type: "Feature",
      properties: {
        color: signalColor(n.snr),
        dim: hoveredId != null && hoveredId !== n.nodeId,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [node.lon as number, node.lat as number],
          [n.lon as number, n.lat as number],
        ],
      },
    })),
  };
}

// Points : le sujet (kind 'subject') + chaque voisin localisé (kind 'neighbor').
export function buildNodeFeatures(
  node: SubjectNode,
  located: MapNode[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "subject", label: nodeLabel(node.nodeId, node.name), color: SUBJECT_COLOR },
        geometry: { type: "Point", coordinates: [node.lon as number, node.lat as number] },
      },
      ...located.map((n) => ({
        type: "Feature" as const,
        properties: { kind: "neighbor", nodeId: n.nodeId, label: nodeLabel(n.nodeId, n.name), color: signalColor(n.snr) },
        geometry: { type: "Point" as const, coordinates: [n.lon as number, n.lat as number] },
      })),
    ],
  };
}

// Sépare les sauts d'un traceroute par sens (pour l'affichage aller / retour).
export function splitHops(hops: TracerouteHop[]): {
  forward: TracerouteHop[];
  back: TracerouteHop[];
} {
  return {
    forward: hops.filter((h) => h.direction === "forward"),
    back: hops.filter((h) => h.direction === "back"),
  };
}
