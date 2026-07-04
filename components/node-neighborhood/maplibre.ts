import type maplibregl from "maplibre-gl";

export const NEIGHBORHOOD_MAP_STYLE =
  "https://tiles.openfreemap.org/styles/liberty";

export type NeighborhoodSourceId =
  | "nb-links"
  | "nb-trace-halo"
  | "nb-trace-anim"
  | "nb-trace-arrows"
  | "nb-trace-pulses"
  | "nb-trace-packet";

export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function setNeighborhoodSource(
  map: maplibregl.Map | null,
  sourceId: NeighborhoodSourceId,
  data: GeoJSON.FeatureCollection,
) {
  (map?.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData(
    data,
  );
}

export function clearTraceSources(map: maplibregl.Map | null) {
  const empty = emptyFeatureCollection();
  setNeighborhoodSource(map, "nb-trace-anim", empty);
  setNeighborhoodSource(map, "nb-trace-halo", empty);
  setNeighborhoodSource(map, "nb-trace-arrows", empty);
  setNeighborhoodSource(map, "nb-trace-pulses", empty);
  setNeighborhoodSource(map, "nb-trace-packet", empty);
}

export function addNeighborhoodSourcesAndLayers(map: maplibregl.Map) {
  map.addSource("nb-links", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addSource("nb-trace-halo", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addSource("nb-trace-anim", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addSource("nb-trace-arrows", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addSource("nb-trace-pulses", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addSource("nb-trace-packet", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addLayer({
    id: "nb-links",
    type: "line",
    source: "nb-links",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["case", ["get", "dim"], 1.5, 3],
      "line-opacity": ["case", ["get", "dim"], 0.08, 0.9],
      "line-opacity-transition": { duration: 200 },
    },
  });
  map.addLayer({
    id: "nb-trace-halo",
    type: "line",
    source: "nb-trace-halo",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["get", "width"],
      "line-blur": 5,
      "line-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "nb-trace-anim",
    type: "line",
    source: "nb-trace-anim",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["get", "width"],
      "line-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "nb-trace-arrows",
    type: "symbol",
    source: "nb-trace-arrows",
    layout: {
      "symbol-placement": "point",
      "text-field": "▲",
      "text-size": 10,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-keep-upright": false,
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "map",
      "text-rotate": ["get", "rotate"],
    },
    paint: {
      "text-color": ["get", "color"],
      "text-halo-color": "#262C2E",
      "text-halo-width": 0.1,
      "text-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "nb-trace-pulse-ring",
    type: "circle",
    source: "nb-trace-pulses",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["get", "radius"],
      "circle-opacity": ["get", "opacity"],
      "circle-blur": 0.65,
    },
  });
  map.addLayer({
    id: "nb-trace-pulse-core",
    type: "circle",
    source: "nb-trace-pulses",
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": ["get", "coreRadius"],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "nb-trace-packet",
    type: "circle",
    source: "nb-trace-packet",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["get", "radius"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": ["get", "opacity"],
      "circle-blur": 0.12,
    },
  });
}
