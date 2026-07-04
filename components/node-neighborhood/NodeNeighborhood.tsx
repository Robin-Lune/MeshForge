"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { NodeMapLink, NodeTraceroute } from "@/types";
import { pillElement } from "@/components/map/map-dom";
import { resolvePillSpread } from "@/components/map/pill-spread";
import {
  NodeNeighborhoodLegend,
  NodeNeighborhoodLinksList,
  TraceroutePanel,
} from "./Details";
import {
  escapeHtml,
  markerBoxes,
  nodeIdFromMarkerKey,
  placeTraceLabel,
} from "./labels";
import {
  NEIGHBORHOOD_MAP_STYLE,
  addNeighborhoodSourcesAndLayers,
  clearTraceSources,
  emptyFeatureCollection,
  setNeighborhoodSource,
} from "./maplibre";
import {
  buildTraceAnimationFrame,
  traceAnimationDuration,
} from "./animation";
import {
  buildLinkFeatures,
  buildNodeFeatures,
} from "./features";
import {
  locatedNeighbors,
  type VisualNodeAnchors,
} from "./format";

type Props = {
  node: {
    nodeId: string;
    name: string | null;
    lat: number | null;
    lon: number | null;
  };
  links: NodeMapLink[];
  traceroutes: NodeTraceroute[];
};

export default function NodeNeighborhood({ node, links, traceroutes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const visualAnchorsRef = useRef<VisualNodeAnchors>({});
  const visualOffsetsRef = useRef<Record<string, [number, number]>>({});
  const nodeRef = useRef(node);
  const locatedRef = useRef(locatedNeighbors(links));
  const linkFocusRef = useRef<string | null>(null);
  const traceRafRef = useRef<number | null>(null);
  const tracePacketMarkerRef = useRef<maplibregl.Marker | null>(null);
  const traceLabelsLayerRef = useRef<HTMLDivElement | null>(null);
  const traceLabelsRef = useRef<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const located = locatedNeighbors(links);
  const hasPos = node.lat != null && node.lon != null;
  const locatedKey = located.map((l) => l.nodeId).join(",");
  const activeNode = hovered ?? selected;
  const trace =
    activeNode != null
      ? (traceroutes.find((t) => t.otherNode === activeNode) ?? null)
      : null;
  const traceKey = trace
    ? `${trace.sourceNode}|${trace.targetNode}|${trace.receivedAt}`
    : "";
  const linkFocus = trace ? "__fade-all__" : hovered;
  const selectableNodeIds = new Set([
    ...links.map((l) => l.nodeId),
    ...traceroutes.map((t) => t.otherNode),
  ]);

  const buildNodes = () => buildNodeFeatures(node, located, trace);
  const syncLinks = (
    focus = linkFocusRef.current,
    currentNode = nodeRef.current,
    currentLocated = locatedRef.current,
  ) => {
    setNeighborhoodSource(
      mapRef.current,
      "nb-links",
      buildLinkFeatures(
        currentNode,
        currentLocated,
        focus,
        null,
        visualAnchorsRef.current,
      ),
    );
  };

  useEffect(() => {
    nodeRef.current = node;
    locatedRef.current = located;
    linkFocusRef.current = linkFocus;
  });

  const clearTraceAnimation = () => {
    if (traceRafRef.current !== null) cancelAnimationFrame(traceRafRef.current);
    traceRafRef.current = null;
    const empty = emptyFeatureCollection();
    clearTraceSources(mapRef.current);
    tracePacketMarkerRef.current?.remove();
    tracePacketMarkerRef.current = null;
    syncTraceLabels(empty);
  };

  const syncTraceLabels = (labels: GeoJSON.FeatureCollection) => {
    traceLabelsRef.current = labels;
    const map = mapRef.current;
    const layer = traceLabelsLayerRef.current;
    const container = containerRef.current;
    if (!map || !layer || !container) return;
    layer.textContent = "";
    const occupied = markerBoxes(container);
    for (const f of labels.features) {
      if (f.geometry.type !== "Point") continue;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const point = map.project(f.geometry.coordinates as [number, number]);
      const el = document.createElement("div");
      el.className = `mf-trace-label ${props.direction === "back" ? "mf-trace-label-rx" : "mf-trace-label-tx"}`;
      el.style.opacity = String(props.opacity ?? 1);
      el.innerHTML = `<strong>${escapeHtml(String(props.prefix ?? ""))}</strong><span>${escapeHtml(String(props.value ?? ""))}</span>`;
      layer.appendChild(el);
      occupied.push(
        placeTraceLabel(
          el,
          point.x,
          point.y,
          props.direction === "back",
          occupied,
        ),
      );
    }
  };

  const syncTracePacket = (packet: GeoJSON.FeatureCollection) => {
    const map = mapRef.current;
    const head = packet.features[0];
    if (!map || head?.geometry.type !== "Point") {
      tracePacketMarkerRef.current?.remove();
      tracePacketMarkerRef.current = null;
      return;
    }
    const props = (head.properties ?? {}) as Record<string, unknown>;
    let marker = tracePacketMarkerRef.current;
    if (!marker) {
      const el = document.createElement("div");
      el.className = "mf-trace-packet";
      el.innerHTML = "<span></span><i></i><b></b>";
      marker = new maplibregl.Marker({ element: el, anchor: "center" });
      tracePacketMarkerRef.current = marker;
    }
    marker
      .getElement()
      .style.setProperty("--packet-color", String(props.color ?? "#67ea94"));
    marker.setLngLat(head.geometry.coordinates as [number, number]).addTo(map);
  };

  const refreshVisualAnchors = () => {
    const map = mapRef.current;
    if (!map) return;
    const anchors: VisualNodeAnchors = {};
    for (const [key, marker] of Object.entries(markersRef.current)) {
      const [dx, dy] = visualOffsetsRef.current[key] ?? [0, 0];
      const point = map.project(marker.getLngLat());
      const anchor = map.unproject([point.x + dx, point.y + dy]);
      anchors[nodeIdFromMarkerKey(key)] = [anchor.lng, anchor.lat];
    }
    visualAnchorsRef.current = anchors;
  };

  const spreadPills = (markers: Record<string, maplibregl.Marker>) => {
    const map = mapRef.current;
    if (!map) return;
    const entries = Object.entries(markers);
    const boxes = entries.map(([, marker]) => {
      const el = marker.getElement();
      const pt = map.project(marker.getLngLat());
      return {
        x: pt.x,
        y: pt.y,
        w: Number(el.dataset.w) || 40,
        h: Number(el.dataset.h) || 22,
      };
    });
    const offsets = resolvePillSpread(boxes, 6);
    const nextOffsets: Record<string, [number, number]> = {};
    entries.forEach(([key, marker], i) => {
      const offset: [number, number] = [offsets[i].dx, offsets[i].dy];
      marker.setOffset(offset);
      nextOffsets[key] = offset;
    });
    visualOffsetsRef.current = nextOffsets;
    refreshVisualAnchors();
  };

  const syncMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    const next: Record<string, maplibregl.Marker> = {};
    for (const f of buildNodes().features) {
      if (f.geometry.type !== "Point") continue;
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const nodeId = String(p.nodeId ?? "");
      if (!nodeId) continue;
      const key = `${String(p.kind ?? "node")}:${nodeId}`;
      const coords = f.geometry.coordinates as [number, number];
      let marker = markersRef.current[key];
      if (!marker) {
        const el = pillElement({
          label: p.label,
          color: p.color,
          isGateway: false,
        });
        if (p.kind === "neighbor" || p.kind === "trace") {
          el.addEventListener("mouseenter", () => {
            if (selectableNodeIds.has(nodeId)) {
              setHovered(nodeId);
              return;
            }
            setHovered(null);
            setSelected(null);
          });
          el.addEventListener("mouseleave", () => setHovered(null));
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!selectableNodeIds.has(nodeId)) {
              setHovered(null);
              setSelected(null);
              return;
            }
            setSelected((current) => (current === nodeId ? null : nodeId));
          });
        }
        marker = new maplibregl.Marker({ element: el }).setLngLat(coords);
      } else {
        marker.setLngLat(coords);
      }
      marker.addTo(map);
      next[key] = marker;
    }
    const previous = markersRef.current;
    for (const [key, marker] of Object.entries(previous)) {
      if (!next[key]) marker.remove();
    }
    markersRef.current = next;
    spreadPills(next);
  };

  const fit = () => {
    const map = mapRef.current;
    if (!map) return;
    const points = buildNodes().features.filter(
      (f) => f.geometry.type === "Point",
    );
    if (points.length <= 1) {
      map.jumpTo({
        center: [node.lon as number, node.lat as number],
        zoom: 11,
      });
      return;
    }
    const b = new maplibregl.LngLatBounds();
    for (const f of points) {
      b.extend((f.geometry as GeoJSON.Point).coordinates as [number, number]);
    }
    map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 0 });
  };

  useEffect(() => {
    if (!containerRef.current || !hasPos) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: NEIGHBORHOOD_MAP_STYLE,
      center: [node.lon as number, node.lat as number],
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on("load", () => {
      addNeighborhoodSourcesAndLayers(map);
      setReady(true);
    });
    const labelsLayer = document.createElement("div");
    labelsLayer.className = "mf-trace-label-layer";
    containerRef.current.appendChild(labelsLayer);
    traceLabelsLayerRef.current = labelsLayer;
    map.on("move", () => {
      refreshVisualAnchors();
      syncLinks();
      syncTraceLabels(traceLabelsRef.current);
    });
    map.on("click", () => {
      setHovered(null);
      setSelected(null);
    });
    return () => {
      clearTraceAnimation();
      traceLabelsLayerRef.current?.remove();
      traceLabelsLayerRef.current = null;
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPos]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    fit();
    syncMarkers();
    syncLinks(linkFocus, node, located);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locatedKey, traceKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncMarkers();
    syncLinks(linkFocus, node, located);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode, traceKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    clearTraceAnimation();
    const duration = traceAnimationDuration(trace);
    if (!trace || duration === 0) return;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(now - startedAt, duration);
      const frame = buildTraceAnimationFrame(
        trace,
        elapsed,
        visualAnchorsRef.current,
      );
      setNeighborhoodSource(map, "nb-trace-halo", frame.halo);
      setNeighborhoodSource(map, "nb-trace-anim", frame.lines);
      setNeighborhoodSource(map, "nb-trace-arrows", frame.arrows);
      syncTraceLabels(frame.labels);
      setNeighborhoodSource(map, "nb-trace-pulses", frame.pulses);
      setNeighborhoodSource(map, "nb-trace-packet", frame.packet);
      syncTracePacket(frame.packet);
      if (elapsed < duration)
        traceRafRef.current = requestAnimationFrame(animate);
      else {
        tracePacketMarkerRef.current?.remove();
        tracePacketMarkerRef.current = null;
        traceRafRef.current = null;
      }
    };
    traceRafRef.current = requestAnimationFrame(animate);
    return clearTraceAnimation;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, traceKey]);

  if (links.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Aucun lien connu (ce nœud n&apos;a capté aucun autre nœud et n&apos;a
        émis aucun NeighborInfo sur 30 j).
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 text-sm text-zinc-500">
        {links.length} nœud(s) lié(s)
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {hasPos ? (
            <div
              ref={containerRef}
              className="mf-neighborhood-map isolate h-64 w-full overflow-hidden rounded-lg border border-black/10 sm:h-80 dark:border-white/15"
            />
          ) : (
            <p className="rounded-lg border border-black/10 p-4 text-sm text-zinc-400 dark:border-white/15">
              Carte indisponible : ce nœud n&apos;a pas de position connue.
            </p>
          )}
          <NodeNeighborhoodLegend />
        </div>

        <div className="min-w-0">
          <NodeNeighborhoodLinksList
            links={links}
            activeNode={activeNode}
            onHover={setHovered}
            onToggle={(nodeId) =>
              setSelected((current) => (current === nodeId ? null : nodeId))
            }
          />
          <TraceroutePanel activeNode={activeNode} trace={trace} />
        </div>
      </div>
    </div>
  );
}
