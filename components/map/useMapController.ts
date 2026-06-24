"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import type { PublicNode, NodeUpdate, Observation, MapBounds } from "@/types";
import {
  nodeFeature,
  shortLabel,
  lerp,
  lineFeature,
} from "@/components/map/map-data";
import type { LngLat } from "@/components/map/map-data";
import {
  clusterElement,
  hoverCard,
  pillElement,
} from "@/components/map/map-dom";
import {
  MESH_DIRECT_LAYER,
  MESH_RELAY_LAYER,
} from "@/components/map/map-layers";

const REUNION_CENTER: [number, number] = [55.536, -21.115];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type MapFiltersState = {
  search: string;
  role: string;
  sinceH: number;
  maxHop: number;
};

type UseMapControllerProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  bounds: MapBounds | null;
  minZoom: number;
  filters: MapFiltersState;
};

export function useMapController({
  containerRef,
  bounds,
  minZoom,
  filters,
}: UseMapControllerProps) {
  const nodesById = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const obsRef = useRef<Map<string, { nodeId: string; hop: number }[]>>(
    new Map(),
  );
  const minHopRef = useRef<Map<string, number>>(new Map());
  const bridgeRef = useRef<Set<string>>(new Set());
  const filtersRef = useRef(filters);
  const refreshRef = useRef<() => void>(() => {});
  const router = useRouter();
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    filtersRef.current = filters;
    refreshRef.current();
  }, [filters]);

  useEffect(() => {
    if (!containerRef.current) return;
    let alive = true;

    const center: [number, number] = bounds
      ? [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
      : REUNION_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: Math.max(9, minZoom),
      minZoom,
      maxBounds: bounds
        ? [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ]
        : undefined,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    const tapToPreview = window.matchMedia(
      "(hover: none), (pointer: coarse)",
    ).matches;

    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 19,
      className: "mf-popup",
    });
    let pinnedNodeId: string | null = null;
    const openNodePopup = (
      nodeId: string,
      p: Record<string, unknown>,
      c: maplibregl.LngLat,
    ): void => {
      const card = hoverCard(p);
      card.style.cursor = "pointer";
      card.addEventListener("click", (event) => {
        event.stopPropagation();
        routerRef.current.push(`/node/${encodeURIComponent(nodeId)}`);
      });
      hoverPopup.setLngLat(c).setDOMContent(card).addTo(map);
    };

    const nodesSource = (): maplibregl.GeoJSONSource | undefined =>
      alive
        ? (map.getSource("nodes") as maplibregl.GeoJSONSource | undefined)
        : undefined;
    const refreshNodes = (): void => {
      if (!alive) return;
      const { search, role, sinceH, maxHop } = filtersRef.current;
      const q = search.trim().toLowerCase();
      const minSeen = sinceH > 0 ? Date.now() - sinceH * 3600000 : 0;
      const features = [...nodesById.current.values()].filter((f) => {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        if (role && p.role !== role) return false;
        if (minSeen) {
          const t = p.lastSeen ? new Date(p.lastSeen as string).getTime() : 0;
          if (t < minSeen) return false;
        }
        if (q) {
          const hay = `${p.nodeId} ${p.longName} ${p.shortName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (maxHop < 9 && p.isGateway !== true) {
          const mh = minHopRef.current.get(p.nodeId as string);
          if (mh === undefined || mh > maxHop) return false;
        }
        return true;
      });
      nodesSource()?.setData({ type: "FeatureCollection", features });
    };
    refreshRef.current = refreshNodes;
    const posById = (nodeId: string): LngLat | null => {
      const f = nodesById.current.get(nodeId);
      return f && f.geometry.type === "Point"
        ? (f.geometry.coordinates as LngLat)
        : null;
    };

    let meshRaf: number | null = null;
    const meshSource = (): maplibregl.GeoJSONSource | undefined =>
      map.getSource("mesh") as maplibregl.GeoJSONSource | undefined;
    const clearMesh = (): void => {
      if (meshRaf !== null) cancelAnimationFrame(meshRaf);
      meshRaf = null;
      meshSource()?.setData({ type: "FeatureCollection", features: [] });
    };
    const drawMesh = (gatewayId: string, gw: LngLat): void => {
      const src = meshSource();
      if (!src) return;
      const { maxHop } = filtersRef.current;
      const targets = (obsRef.current.get(gatewayId) ?? [])
        .filter((e) => e.hop <= maxHop)
        .map((e) => ({ hop: e.hop, pos: posById(e.nodeId) }))
        .filter((t): t is { hop: number; pos: LngLat } => t.pos !== null);
      if (!targets.length) return;
      const start = performance.now();
      const ease = (p: number): number => 1 - (1 - p) * (1 - p);
      const step = (now: number): void => {
        const p = ease(Math.min((now - start) / 550, 1));
        src.setData({
          type: "FeatureCollection",
          features: targets.map((t) =>
            lineFeature(gw, lerp(gw, t.pos, p), t.hop),
          ),
        });
        if (p < 1) meshRaf = requestAnimationFrame(step);
      };
      meshRaf = requestAnimationFrame(step);
    };

    const markers: Record<string, maplibregl.Marker> = {};
    let onScreen: Record<string, maplibregl.Marker> = {};

    const spreadPills = (): void => {
      const items = Object.keys(onScreen)
        .filter((id) => id.startsWith("n"))
        .map((id) => {
          const el = onScreen[id].getElement();
          const pt = map.project(onScreen[id].getLngLat());
          return {
            m: onScreen[id],
            x: pt.x,
            y: pt.y,
            w: Number(el.dataset.w) || 40,
            h: Number(el.dataset.h) || 22,
            dx: 0,
            dy: 0,
          };
        });
      const PAD = 4;
      for (let iter = 0; iter < 12; iter++) {
        let moved = false;
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i];
            const b = items[j];
            const dx = b.x + b.dx - (a.x + a.dx);
            const dy = b.y + b.dy - (a.y + a.dy);
            const ox = (a.w + b.w) / 2 + PAD - Math.abs(dx);
            const oy = (a.h + b.h) / 2 + PAD - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            moved = true;
            if (ox < oy) {
              const push = ox * (dx < 0 ? -1 : 1);
              a.dx -= push / 2;
              b.dx += push / 2;
            } else {
              const push = oy * (dy < 0 ? -1 : 1);
              a.dy -= push / 2;
              b.dy += push / 2;
            }
          }
        }
        if (!moved) break;
      }
      for (const it of items) it.m.setOffset([it.dx, it.dy]);
    };

    const applyBridge = (): void => {
      for (const id in onScreen) {
        if (!id.startsWith("n")) continue;
        const el = onScreen[id].getElement();
        el.style.boxShadow = bridgeRef.current.has(id.slice(1))
          ? "0 0 0 3px #2563eb, 0 1px 3px rgba(0,0,0,0.4)"
          : "0 1px 3px rgba(0,0,0,0.35)";
      }
    };

    const updateMarkers = (): void => {
      if (!map.getSource("nodes") || !map.isSourceLoaded("nodes")) return;
      const next: Record<string, maplibregl.Marker> = {};
      for (const f of map.querySourceFeatures("nodes")) {
        if (f.geometry.type !== "Point") continue;
        const coords = f.geometry.coordinates as LngLat;
        const p = f.properties;
        const isCluster = p.cluster === true;
        const id = isCluster ? `c${p.cluster_id}` : `n${p.nodeId}`;
        if (next[id]) continue;

        let marker = markers[id];
        if (!marker) {
          const el = isCluster ? clusterElement(p) : pillElement(p);
          marker = markers[id] = new maplibregl.Marker({
            element: el,
          }).setLngLat(coords);
          const m = marker;
          if (isCluster) {
            const clusterId = p.cluster_id as number;
            el.addEventListener("click", () => {
              nodesSource()
                ?.getClusterExpansionZoom(clusterId)
                .then((zoom) => map.easeTo({ center: m.getLngLat(), zoom }));
            });
          } else {
            const nodeId = String(p.nodeId);
            el.addEventListener("mouseenter", () => {
              if (tapToPreview) return;
              if (pinnedNodeId) return;
              const c = m.getLngLat();
              openNodePopup(nodeId, p, c);
              if (p.isGateway === true) drawMesh(nodeId, [c.lng, c.lat]);
            });
            el.addEventListener("mouseleave", () => {
              if (tapToPreview) return;
              if (pinnedNodeId) return;
              hoverPopup.remove();
              clearMesh();
            });
            el.addEventListener("click", (event) => {
              event.stopPropagation();
              if (!tapToPreview) {
                routerRef.current.push(`/node/${encodeURIComponent(nodeId)}`);
                return;
              }
              pinnedNodeId = nodeId;
              const c = m.getLngLat();
              openNodePopup(nodeId, p, c);
              clearMesh();
              if (p.isGateway === true) drawMesh(nodeId, [c.lng, c.lat]);
            });
          }
        } else {
          marker.setLngLat(coords);
        }
        next[id] = marker;
        if (!onScreen[id]) marker.addTo(map);
      }
      for (const id in onScreen) {
        if (!next[id]) onScreen[id].remove();
      }
      onScreen = next;
      spreadPills();
      applyBridge();
    };

    map.on("load", () => {
      map.addSource("nodes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 10,
        clusterProperties: {
          hasGateway: ["max", ["case", ["get", "isGateway"], 1, 0]],
        },
      });
      map.addSource("mesh", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "nodes-hit",
        type: "circle",
        source: "nodes",
        paint: { "circle-radius": 1, "circle-opacity": 0 },
      });
      map.addLayer(MESH_DIRECT_LAYER);
      map.addLayer(MESH_RELAY_LAYER);
      refreshNodes();

      fetch("/api/observations")
        .then((r) => r.json() as Promise<Observation[]>)
        .then((obs) => {
          const m = obsRef.current;
          m.clear();
          const minHop = minHopRef.current;
          minHop.clear();
          const gwByNode = new Map<string, Set<string>>();
          for (const o of obs) {
            const hop = o.bestHop ?? 9;
            const arr = m.get(o.gatewayId) ?? [];
            arr.push({ nodeId: o.nodeId, hop });
            m.set(o.gatewayId, arr);
            const prev = minHop.get(o.nodeId);
            if (prev === undefined || hop < prev) minHop.set(o.nodeId, hop);
            const set = gwByNode.get(o.nodeId) ?? new Set<string>();
            set.add(o.gatewayId);
            gwByNode.set(o.nodeId, set);
          }
          bridgeRef.current = new Set(
            [...gwByNode].filter(([, s]) => s.size >= 2).map(([n]) => n),
          );
          applyBridge();
          refreshNodes();
        })
        .catch(() => {});
    });

    map.on("data", (e) => {
      const sourceId = (e as { sourceId?: string }).sourceId;
      if (sourceId === "nodes" && map.isSourceLoaded("nodes")) updateMarkers();
    });
    map.on("click", () => {
      pinnedNodeId = null;
      hoverPopup.remove();
      clearMesh();
    });
    map.on("move", updateMarkers);
    map.on("moveend", updateMarkers);

    fetch("/api/nodes")
      .then((r) => r.json() as Promise<PublicNode[]>)
      .then((nodes) => {
        nodes.forEach((n) => nodesById.current.set(n.nodeId, nodeFeature(n)));
        refreshNodes();
      })
      .catch(() => {});

    const es = new EventSource("/api/stream");
    es.addEventListener("node_update", (event) => {
      try {
        const u = JSON.parse((event as MessageEvent).data) as NodeUpdate;
        const existing = nodesById.current.get(u.nodeId);
        if (existing && existing.geometry.type === "Point") {
          existing.geometry.coordinates = [u.lon, u.lat];
          const p = existing.properties as Record<string, unknown>;
          p.longName = u.longName ?? p.longName;
          p.shortName = u.shortName ?? p.shortName;
          p.label = shortLabel(
            u.nodeId,
            (u.shortName ?? p.shortName) as string,
          );
          p.lastSeen = u.lastSeen ?? "";
        } else {
          nodesById.current.set(u.nodeId, nodeFeature(u));
        }
        refreshNodes();
      } catch {}
    });

    return () => {
      alive = false;
      refreshRef.current = () => {};
      es.close();
      if (meshRaf !== null) cancelAnimationFrame(meshRaf);
      Object.values(markers).forEach((m) => m.remove());
      map.remove();
    };
  }, [bounds, containerRef, minZoom]);
}
