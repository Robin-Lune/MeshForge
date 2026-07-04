import type {
  LineLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { SNR_GOOD } from "./signal-color";

export const MESH_DIRECT_LAYER: LineLayerSpecification = {
  id: "mesh-direct",
  type: "line",
  source: "mesh",
  filter: ["==", ["get", "hop"], 0],
  layout: { "line-cap": "round" },
  paint: { "line-color": SNR_GOOD, "line-width": 3, "line-opacity": 0.9 },
};

export const MESH_RELAY_LAYER: LineLayerSpecification = {
  id: "mesh-relay",
  type: "line",
  source: "mesh",
  filter: ["!=", ["get", "hop"], 0],
  layout: { "line-cap": "round" },
  paint: {
    "line-color": [
      "interpolate",
      ["linear"],
      ["get", "hop"],
      1,
      "#eab308",
      2,
      "#f97316",
      3,
      "#ef4444",
    ],
    "line-width": 1.5,
    "line-dasharray": [1.5, 1.5],
    "line-opacity": 0.85,
  },
};

// Badge (nombre de paquets échangés) au milieu d'un lien, au survol d'un nœud.
// Points ajoutés à la source `mesh` par drawMesh ; halo blanc pour la lisibilité.
export const MESH_BADGE_LAYER: SymbolLayerSpecification = {
  id: "mesh-badge",
  type: "symbol",
  source: "mesh",
  filter: ["==", ["geometry-type"], "Point"],
  minzoom: 9,
  layout: {
    "text-field": ["to-string", ["get", "packets"]],
    "text-font": ["Noto Sans Bold"],
    "text-size": 11,
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#111827",
    "text-halo-color": "#ffffff",
    "text-halo-width": 1.6,
  },
};
