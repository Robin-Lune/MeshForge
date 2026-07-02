import type {
  LineLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";

export const MESH_DIRECT_LAYER: LineLayerSpecification = {
  id: "mesh-direct",
  type: "line",
  source: "mesh",
  filter: ["==", ["get", "hop"], 0],
  layout: { "line-cap": "round" },
  paint: { "line-color": "#22c55e", "line-width": 3, "line-opacity": 0.9 },
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

// Vue persistante "liens directs" (hop 0). La couleur (barème SNR+RSSI
// Meshtastic) est précalculée par lien (cf. signalColor) et portée par la
// propriété `color`. `dim` = estompé quand un autre node est survolé (focus).
export const LINKS_LINE_LAYER: LineLayerSpecification = {
  id: "links-line",
  type: "line",
  source: "links",
  filter: ["==", ["geometry-type"], "LineString"],
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": ["get", "color"],
    "line-width": ["case", ["get", "dim"], 1.5, 2.75],
    "line-opacity": ["case", ["get", "dim"], 0.12, 0.9],
  },
};

// Trajet LOGIQUE A↔D d'un traceroute (pas un lien radio direct) : pointillé
// violet tracé au survol de A ou D quand "Liens directs" est désactivé.
export const TRACEPATHS_LAYER: LineLayerSpecification = {
  id: "tracepaths-line",
  type: "line",
  source: "tracepaths",
  filter: ["==", ["geometry-type"], "LineString"],
  layout: { "line-cap": "round" },
  paint: {
    "line-color": "#a855f7",
    "line-width": 2,
    "line-dasharray": [2, 2],
    "line-opacity": 0.9,
  },
};

// Badge nombre de sauts du trajet logique (au milieu du pointillé).
export const TRACEPATHS_BADGE_LAYER: SymbolLayerSpecification = {
  id: "tracepaths-badge",
  type: "symbol",
  source: "tracepaths",
  filter: ["==", ["geometry-type"], "Point"],
  minzoom: 10,
  layout: {
    "text-field": ["concat", ["to-string", ["get", "hops"]], " sauts"],
    "text-font": ["Noto Sans Bold"],
    "text-size": 10,
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#6b21a8",
    "text-halo-color": "#ffffff",
    "text-halo-width": 1.6,
  },
};

// Badge compteur de paquets, au sommet de l'arc (point). Masqué au dézoom pour
// éviter le fouillis ; halo blanc pour rester lisible sur le fond.
export const LINKS_BADGE_LAYER: SymbolLayerSpecification = {
  id: "links-badge",
  type: "symbol",
  source: "links",
  filter: ["==", ["geometry-type"], "Point"],
  minzoom: 11,
  layout: {
    "text-field": ["to-string", ["get", "packets"]],
    "text-font": ["Noto Sans Bold"],
    "text-size": 11,
    "text-allow-overlap": false,
    "text-ignore-placement": false,
  },
  paint: {
    "text-color": "#111827",
    "text-halo-color": "#ffffff",
    "text-halo-width": 1.6,
    "text-opacity": ["case", ["get", "dim"], 0.15, 1],
  },
};
