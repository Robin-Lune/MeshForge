// SPDX-License-Identifier: AGPL-3.0-or-later
import maplibregl from "maplibre-gl";
import type { HopFilter } from "./MapFilters";
import { bestTargets, type HoverEdge } from "./hover-edges";
import { lerp, lineFeature, type LngLat } from "./map-data";
import { clusterElement, hoverCard, pillElement } from "./map-dom";
import { resolvePillSpread } from "./pill-spread";
import { haversineKm } from "@/lib/geo";

export type NodeMapFilters = {
  search: string;
  role: string;
  sinceH: number;
  hopFilter: HopFilter;
};

type NodeMarkerControllerOptions = {
  map: maplibregl.Map;
  tapToPreview: boolean;
  maxLinkDistanceKm: number;
  nodes: Map<string, GeoJSON.Feature>;
  getFilters: () => NodeMapFilters;
  getMinHopByNode: () => Map<string, number>;
  getBridgeNodeIds: () => Set<string>;
  getHoverByNode: () => Map<string, HoverEdge[]>;
  onOpenNode: (nodeId: string) => void;
};

export type NodeMarkerController = {
  refreshNodes: () => void;
  updateMarkers: () => void;
  applyBridgeHighlight: () => void;
  clearSelection: () => void;
  popupIsOpen: () => boolean;
  destroy: () => void;
};

export function matchesHopFilter(
  hop: number | undefined,
  filter: HopFilter,
): boolean {
  if (filter === "all") return true;
  if (hop === undefined) return false;
  if (filter === "3plus") return hop >= 3;
  return hop === Number(filter);
}

export function createNodeMarkerController({
  map,
  tapToPreview,
  maxLinkDistanceKm,
  nodes,
  getFilters,
  getMinHopByNode,
  getBridgeNodeIds,
  getHoverByNode,
  onOpenNode,
}: NodeMarkerControllerOptions): NodeMarkerController {
  let alive = true;
  let pinnedNodeId: string | null = null;
  let activeMeshNodeId: string | null = null;
  let meshRaf: number | null = null;
  let visualAnchors = new Map<string, LngLat>();
  const markers: Record<string, maplibregl.Marker> = {};
  let onScreen: Record<string, maplibregl.Marker> = {};

  const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 19,
    className: "mf-popup",
  });

  const nodesSource = (): maplibregl.GeoJSONSource | undefined =>
    alive
      ? (map.getSource("nodes") as maplibregl.GeoJSONSource | undefined)
      : undefined;

  const meshSource = (): maplibregl.GeoJSONSource | undefined =>
    alive
      ? (map.getSource("mesh") as maplibregl.GeoJSONSource | undefined)
      : undefined;

  const positionOf = (nodeId: string): LngLat | null => {
    const feature = nodes.get(nodeId);
    return feature?.geometry.type === "Point"
      ? (feature.geometry.coordinates as LngLat)
      : null;
  };

  const visualAnchor = (nodeId: string): LngLat | null =>
    visualAnchors.get(nodeId) ?? positionOf(nodeId);

  const clearMesh = (): void => {
    if (meshRaf !== null) cancelAnimationFrame(meshRaf);
    meshRaf = null;
    meshSource()?.setData({ type: "FeatureCollection", features: [] });
  };

  const drawMesh = (nodeId: string, animate = true): void => {
    const source = meshSource();
    if (!source) return;
    activeMeshNodeId = nodeId;

    const rawStart = positionOf(nodeId);
    const visualStart = visualAnchor(nodeId);
    if (!rawStart || !visualStart) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const { hopFilter } = getFilters();
    const targets = bestTargets(getHoverByNode().get(nodeId) ?? [])
      .filter((edge) => matchesHopFilter(edge.hop, hopFilter))
      .map((edge) => ({
        hop: edge.hop,
        packets: edge.packets,
        rawPosition: positionOf(edge.nodeId),
        visualPosition: visualAnchor(edge.nodeId),
      }))
      .filter(
        (
          target,
        ): target is {
          hop: number;
          packets: number;
          rawPosition: LngLat;
          visualPosition: LngLat;
        } =>
          target.rawPosition !== null && target.visualPosition !== null,
      )
      .filter(
        (target) =>
          haversineKm(
            rawStart[1],
            rawStart[0],
            target.rawPosition[1],
            target.rawPosition[0],
          ) <= maxLinkDistanceKm,
      );

    if (!targets.length) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const start = performance.now();
    const ease = (progress: number): number =>
      1 - (1 - progress) * (1 - progress);
    const step = (now: number): void => {
      const progress = animate
        ? ease(Math.min((now - start) / 550, 1))
        : 1;
      const features: GeoJSON.Feature[] = [];

      for (const target of targets) {
        const end = lerp(visualStart, target.visualPosition, progress);
        features.push(lineFeature(visualStart, end, target.hop));
        if (target.packets > 0) {
          features.push({
            type: "Feature",
            properties: { packets: target.packets },
            geometry: {
              type: "Point",
              coordinates: lerp(visualStart, end, 0.5),
            },
          });
        }
      }

      source.setData({ type: "FeatureCollection", features });
      if (animate && progress < 1) meshRaf = requestAnimationFrame(step);
    };

    if (meshRaf !== null) cancelAnimationFrame(meshRaf);
    meshRaf = requestAnimationFrame(step);
  };

  const openNodePopup = (
    nodeId: string,
    properties: Record<string, unknown>,
    marker: maplibregl.Marker,
  ): void => {
    const card = hoverCard(properties);
    card.style.cursor = "pointer";
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpenNode(nodeId);
    });

    const base = map.project(marker.getLngLat());
    const offset = marker.getOffset();
    const anchor = map.unproject([
      base.x + offset.x,
      base.y + offset.y,
    ]);
    hoverPopup.setLngLat(anchor).setDOMContent(card).addTo(map);
  };

  const refreshNodes = (): void => {
    if (!alive) return;
    const { search, role, sinceH, hopFilter } = getFilters();
    const query = search.trim().toLowerCase();
    const minSeen = sinceH > 0 ? Date.now() - sinceH * 3_600_000 : 0;
    const features = [...nodes.values()].filter((feature) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      if (role && properties.role !== role) return false;
      if (minSeen) {
        const seenAt = properties.lastSeen
          ? new Date(properties.lastSeen as string).getTime()
          : 0;
        if (seenAt < minSeen) return false;
      }
      if (query) {
        const haystack =
          `${properties.nodeId} ${properties.longName} ${properties.shortName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (hopFilter !== "all") {
        if (hopFilter === "0" && properties.isGateway === true) return true;
        const minHop = getMinHopByNode().get(properties.nodeId as string);
        if (!matchesHopFilter(minHop, hopFilter)) return false;
      }
      return true;
    });
    nodesSource()?.setData({ type: "FeatureCollection", features });
  };

  const applyBridgeHighlight = (): void => {
    const bridges = getBridgeNodeIds();
    for (const id in onScreen) {
      if (!id.startsWith("n")) continue;
      const element = onScreen[id].getElement();
      element.style.boxShadow = bridges.has(id.slice(1))
        ? "0 0 0 3px #2563eb, 0 1px 3px rgba(0,0,0,0.4)"
        : "0 1px 3px rgba(0,0,0,0.35)";
    }
  };

  const spreadPills = (): void => {
    const ids = Object.keys(onScreen).filter((id) => id.startsWith("n"));
    const boxes = ids.map((id) => {
      const element = onScreen[id].getElement();
      const point = map.project(onScreen[id].getLngLat());
      return {
        x: point.x,
        y: point.y,
        w: Number(element.dataset.w) || 40,
        h: Number(element.dataset.h) || 22,
      };
    });
    const offsets = resolvePillSpread(boxes);
    const anchors = new Map<string, LngLat>();

    ids.forEach((id, index) => {
      const marker = onScreen[id];
      const offset: [number, number] = [
        offsets[index].dx,
        offsets[index].dy,
      ];
      marker.setOffset(offset);
      const point = map.project(marker.getLngLat());
      const anchor = map.unproject([
        point.x + offset[0],
        point.y + offset[1],
      ]);
      anchors.set(id.slice(1), [anchor.lng, anchor.lat]);
    });

    visualAnchors = anchors;
    if (activeMeshNodeId) drawMesh(activeMeshNodeId, false);
  };

  const updateMarkers = (): void => {
    if (
      !alive ||
      !map.getSource("nodes") ||
      !map.isSourceLoaded("nodes")
    ) {
      return;
    }

    const next: Record<string, maplibregl.Marker> = {};
    for (const feature of map.querySourceFeatures("nodes")) {
      if (feature.geometry.type !== "Point") continue;
      const coordinates = feature.geometry.coordinates as LngLat;
      const properties = feature.properties;
      const isCluster = properties.cluster === true;
      const id = isCluster
        ? `c${properties.cluster_id}`
        : `n${properties.nodeId}`;
      if (next[id]) continue;

      let marker: maplibregl.Marker | undefined = markers[id];
      const gatewayState = isCluster
        ? Number(properties.hasGateway ?? 0) > 0
        : properties.isGateway === true;
      if (
        marker?.getElement().dataset.gateway !== String(gatewayState)
      ) {
        marker?.remove();
        delete markers[id];
        marker = undefined;
      }

      if (!marker) {
        const element = isCluster
          ? clusterElement(properties)
          : pillElement(properties);
        marker = markers[id] = new maplibregl.Marker({ element }).setLngLat(
          coordinates,
        );
        const currentMarker = marker;

        if (isCluster) {
          const clusterId = properties.cluster_id as number;
          element.addEventListener("click", () => {
            nodesSource()
              ?.getClusterExpansionZoom(clusterId)
              .then((zoom) =>
                map.easeTo({
                  center: currentMarker.getLngLat(),
                  zoom,
                }),
              );
          });
        } else {
          const nodeId = String(properties.nodeId);
          element.addEventListener("mouseenter", () => {
            if (tapToPreview || pinnedNodeId) return;
            openNodePopup(nodeId, properties, currentMarker);
            drawMesh(nodeId);
          });
          element.addEventListener("mouseleave", () => {
            if (tapToPreview || pinnedNodeId) return;
            activeMeshNodeId = null;
            hoverPopup.remove();
            clearMesh();
          });
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!tapToPreview) {
              onOpenNode(nodeId);
              return;
            }
            pinnedNodeId = nodeId;
            openNodePopup(nodeId, properties, currentMarker);
            clearMesh();
            drawMesh(nodeId);
          });
        }
      } else {
        marker.setLngLat(coordinates);
      }

      next[id] = marker;
      if (!onScreen[id]) marker.addTo(map);
    }

    for (const id in onScreen) {
      if (!next[id]) onScreen[id].remove();
    }
    onScreen = next;
    spreadPills();
    applyBridgeHighlight();
  };

  const clearSelection = (): void => {
    pinnedNodeId = null;
    activeMeshNodeId = null;
    hoverPopup.remove();
    clearMesh();
  };

  const destroy = (): void => {
    alive = false;
    clearSelection();
    Object.values(markers).forEach((marker) => marker.remove());
    onScreen = {};
  };

  return {
    refreshNodes,
    updateMarkers,
    applyBridgeHighlight,
    clearSelection,
    popupIsOpen: () => hoverPopup.isOpen(),
    destroy,
  };
}
