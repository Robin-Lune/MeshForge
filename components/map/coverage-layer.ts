// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
//
// Couche « tuiles de couverture » (à la VeloViewer). Logique pure, testée : le
// contrôleur de carte ne fait qu'appeler toCoverageGeoJSON et poser les specs.
//
// PRINCIPE DE LISIBILITÉ, non négociable : une tuile ABSENTE signifie « aucune
// donnée », JAMAIS « pas de réseau ». La carte est volontairement clairsemée
// (elle montre le territoire exploré), donc rien n'est peint là où on n'a pas
// mesuré, et on n'interpole jamais entre tuiles — une heatmap lissée
// inventerait de la couverture là où personne n'est jamais passé, alors que
// l'usage visé est justement de décider où poser un relais.
import type {
  FillLayerSpecification,
  LineLayerSpecification,
} from "maplibre-gl";
import type { CoverageMetric, CoverageTile } from "@/types";
import { tileToRing } from "@/lib/tiles";
import { SNR_BAD, SNR_FAIR, SNR_GOOD, signalColor } from "./signal-color";

export const COVERAGE_SOURCE = "coverage";
export const COVERAGE_FILL_ID = "coverage-fill";
export const COVERAGE_LINE_ID = "coverage-line";

// Échelle des métriques de COMPTAGE (redondance / émetteurs distincts). Paliers
// francs, volontairement non interpolés : « 2 relais » est un fait, pas un point
// sur un dégradé. Les libellés correspondants vivent dans MapLegend.
// Écrit en paliers explicites plutôt qu'en table parcourue : la table imposait
// un `?? ` de repli inatteignable (les compteurs valent toujours au moins 1,
// une tuile n'existant que s'il y a au moins une réception), c'est-à-dire une
// branche que rien ne peut couvrir.
const gatewayCountColor = (n: number): string => {
  if (n >= 3) return SNR_GOOD;
  if (n >= 2) return SNR_FAIR;
  return SNR_BAD;
};

const nodeCountColor = (n: number): string => {
  if (n >= 3) return SNR_GOOD;
  if (n >= 2) return SNR_FAIR;
  return SNR_BAD;
};

// Couleur d'une tuile pour la métrique active.
//
// SNR : on colore le p90, pas la moyenne. Une moyenne serait tirée vers le bas
// par les gateways lointaines, donc une tuile entendue par 5 relais scorerait
// PIRE qu'une tuile entendue par un seul relais proche — l'inverse de ce qu'on
// veut montrer. On passe rssi = null à signalColor délibérément : le RSSI
// mélange plancher de bruit et antenne propres à chaque gateway, il n'est donc
// pas comparable d'un relais à l'autre et n'a pas de sens agrégé sur une tuile.
export function tileFillColor(
  tile: CoverageTile,
  metric: CoverageMetric,
): string {
  switch (metric) {
    case "snr":
      return signalColor(tile.snrP90, null);
    case "gateways":
      return gatewayCountColor(tile.gateways);
    case "nodes":
      return nodeCountColor(tile.nodes);
  }
}

export interface CoverageFeatureProps {
  color: string;
  // Indices de la tuile : servent d'IDENTITÉ au survol. Sans eux, le contrôleur
  // ne peut pas savoir si le pointeur a changé de tuile et reconstruit
  // l'infobulle à chaque mousemove (des dizaines de fois par seconde).
  x: number;
  y: number;
  snrP90: number | null;
  snrMax: number | null;
  gateways: number;
  nodes: number;
  transmissions: number;
  samples: number;
  days: number;
}

export type CoverageFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
    properties: CoverageFeatureProps;
  }[];
};

// La couleur est PRÉ-CALCULÉE dans les propriétés : le style MapLibre reste
// ["get","color"] quelle que soit la métrique, donc changer de métrique est un
// simple setData sans toucher au paint. Ça garde signalColor comme source de
// vérité unique du barème (partagée avec les liens de la toile).
export function toCoverageGeoJSON(
  tiles: CoverageTile[],
  z: number,
  metric: CoverageMetric,
): CoverageFeatureCollection {
  return {
    type: "FeatureCollection",
    features: tiles.map((t) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [tileToRing(t.x, t.y, z)] },
      properties: {
        color: tileFillColor(t, metric),
        x: t.x,
        y: t.y,
        snrP90: t.snrP90,
        snrMax: t.snrMax,
        gateways: t.gateways,
        nodes: t.nodes,
        transmissions: t.transmissions,
        samples: t.samples,
        days: t.days,
      },
    })),
  };
}

// Remplissage semi-transparent : le fond de carte (relief, routes) doit rester
// lisible sous la tuile — c'est lui qui donne son sens à la mesure.
export const COVERAGE_FILL_LAYER: FillLayerSpecification = {
  id: COVERAGE_FILL_ID,
  type: "fill",
  source: COVERAGE_SOURCE,
  paint: { "fill-color": ["get", "color"], "fill-opacity": 0.45 },
};

// Grille fine : matérialise la maille, pour qu'on ne confonde pas une étendue
// couverte avec une tache de heatmap, et pour qu'on puisse compter les tuiles.
// COULEUR FIXE, volontairement — et surtout PAS ["get","color"] : deux tuiles
// voisines de même valeur auraient alors un contour de leur propre teinte, donc
// une frontière indiscernable du remplissage, que l'antialiasing efface
// complètement sur une ligne sub-pixel. Le bloc se lirait comme une seule tache
// — exactement ce que cette couche existe pour éviter.
export const COVERAGE_GRID_COLOR = "#111827";

export const COVERAGE_LINE_LAYER: LineLayerSpecification = {
  id: COVERAGE_LINE_ID,
  type: "line",
  source: COVERAGE_SOURCE,
  paint: {
    "line-color": COVERAGE_GRID_COLOR,
    "line-width": 0.6,
    "line-opacity": 0.35,
  },
};
