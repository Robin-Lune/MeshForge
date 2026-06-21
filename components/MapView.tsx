"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl, { type LineLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PublicNode, NodeUpdate, Observation } from "@/types";
import { nodeColor, GATEWAY_COLOR } from "@/lib/nodeColor";

const REUNION_CENTER: [number, number] = [55.536, -21.115];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type LngLat = [number, number];
type MarkerNode = Pick<
  PublicNode,
  | "nodeId"
  | "longName"
  | "shortName"
  | "lat"
  | "lon"
  | "batteryPct"
  | "lastSeen"
> & { isGateway?: boolean; lastSnr?: number | null };

// Libellé : nom court, sinon les 4 derniers du node id (convention Meshtastic).
function shortLabel(
  nodeId: string,
  shortName: string | null | undefined,
): string {
  const s = shortName?.trim();
  return s && s.length > 0 ? s : nodeId.replace(/^!/, "").slice(-4);
}

function nodeFeature(n: MarkerNode): GeoJSON.Feature {
  const isGateway = n.isGateway ?? false;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [n.lon, n.lat] },
    properties: {
      nodeId: n.nodeId,
      label: shortLabel(n.nodeId, n.shortName),
      longName: n.longName ?? "",
      shortName: n.shortName ?? "",
      lastSeen: n.lastSeen ?? "",
      lastSnr: n.lastSnr ?? null,
      isGateway,
      color: nodeColor(n.nodeId, isGateway),
    },
  };
}

// Pastille façon app Meshtastic (nom court). Gateways verts, plus gros, au-dessus.
function pillElement(p: Record<string, unknown>): HTMLElement {
  const isGateway = p.isGateway === true;
  const el = document.createElement("div");
  el.textContent = String(p.label ?? "");
  el.style.background = String(p.color ?? "#3b82f6");
  el.style.color = isGateway ? "#064e3b" : "#fff";
  el.style.font = isGateway
    ? "700 13px/1 ui-sans-serif, system-ui, sans-serif"
    : "600 11px/1 ui-sans-serif, system-ui, sans-serif";
  el.style.padding = isGateway ? "4px 8px" : "3px 6px";
  el.style.borderRadius = "7px";
  el.style.border = isGateway
    ? "2px solid rgba(255,255,255,0.95)"
    : "1.5px solid rgba(255,255,255,0.9)";
  el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";
  el.style.cursor = "pointer";
  el.style.whiteSpace = "nowrap";
  el.style.userSelect = "none";
  el.style.zIndex = isGateway ? "2" : "1";
  // Taille estimée (sans reflow) pour l'anti-superposition. gw : gateway fixe.
  el.dataset.gw = isGateway ? "1" : "0";
  el.dataset.w = String(
    String(p.label ?? "").length * (isGateway ? 8.5 : 7) + (isGateway ? 20 : 16),
  );
  el.dataset.h = String(isGateway ? 24 : 20);
  return el;
}

// Bulle de cluster : vert Meshtastic si un gateway dedans, bleu sinon. Taille ∝ nb.
function clusterElement(p: Record<string, unknown>): HTMLElement {
  const hasGateway = Number(p.hasGateway ?? 0) > 0;
  const count = Number(p.point_count ?? 0);
  const size = count >= 50 ? 44 : count >= 10 ? 38 : 32;
  const el = document.createElement("div");
  el.textContent = String(p.point_count_abbreviated ?? count);
  el.style.background = hasGateway ? GATEWAY_COLOR : "#3b82f6";
  el.style.color = hasGateway ? "#064e3b" : "#fff";
  el.style.font = "700 13px/1 ui-sans-serif, system-ui, sans-serif";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.border = "2px solid #fff";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  el.style.cursor = "pointer";
  return el;
}

// Fiche au survol : nom complet + dernière vue (+ signal). textContent → pas d'XSS.
function hoverCard(p: Record<string, unknown>): HTMLElement {
  const longName = (p.longName as string) || "";
  const shortName = (p.shortName as string) || "";
  const nodeId = (p.nodeId as string) || "";
  const lastSeen = (p.lastSeen as string) || "";
  const lastSnr = p.lastSnr;

  const el = document.createElement("div");
  el.style.color = "#111";
  el.style.fontSize = "12px";
  el.style.lineHeight = "1.4";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = longName || shortName || nodeId;
  el.appendChild(title);

  const seen = document.createElement("div");
  seen.style.color = "#666";
  seen.textContent = lastSeen
    ? `Vu ${new Date(lastSeen).toLocaleString("fr-FR")}`
    : "Jamais vu";
  el.appendChild(seen);

  if (typeof lastSnr === "number") {
    const sig = document.createElement("div");
    sig.textContent = `Signal : ${lastSnr} dB`;
    el.appendChild(sig);
  }
  return el;
}

const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

function lineFeature(from: LngLat, to: LngLat, hop: number): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: { hop },
    geometry: { type: "LineString", coordinates: [from, to] },
  };
}

const MESH_DIRECT_LAYER: LineLayerSpecification = {
  id: "mesh-direct",
  type: "line",
  source: "mesh",
  filter: ["==", ["get", "hop"], 0],
  layout: { "line-cap": "round" },
  paint: { "line-color": "#22c55e", "line-width": 3, "line-opacity": 0.9 },
};
const MESH_RELAY_LAYER: LineLayerSpecification = {
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

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const nodesById = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const obsRef = useRef<Map<string, { nodeId: string; hop: number }[]>>(
    new Map(),
  );
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: REUNION_CENTER,
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    // DEBUG temporaire — badge de zoom (pour caler le seuil cluster ↔ pastille).
    const showZoom = (): void => {
      if (zoomRef.current)
        zoomRef.current.textContent = `zoom ${map.getZoom().toFixed(2)}`;
    };
    map.on("zoom", showZoom);
    map.once("load", showZoom);

    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });

    const nodesSource = (): maplibregl.GeoJSONSource | undefined =>
      map.getSource("nodes") as maplibregl.GeoJSONSource | undefined;
    const refreshNodes = (): void => {
      nodesSource()?.setData({
        type: "FeatureCollection",
        features: [...nodesById.current.values()],
      });
    };
    const posById = (nodeId: string): LngLat | null => {
      const f = nodesById.current.get(nodeId);
      return f && f.geometry.type === "Point"
        ? (f.geometry.coordinates as LngLat)
        : null;
    };

    // --- Toile ---
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
      const targets = (obsRef.current.get(gatewayId) ?? [])
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

    // --- Markers HTML synchronisés depuis la source clusterisée ---
    const markers: Record<string, maplibregl.Marker> = {};
    let onScreen: Record<string, maplibregl.Marker> = {};

    // Anti-superposition : les pastilles trop proches se repoussent (gateways
    // fixes, les autres s'écartent). Décalage écran via setOffset, recalculé à
    // chaque déplacement. Padding = PAD px entre deux pastilles.
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
            fixed: el.dataset.gw === "1",
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
            if (ox <= 0 || oy <= 0 || (a.fixed && b.fixed)) continue;
            moved = true;
            if (ox < oy) {
              const push = ox * (dx < 0 ? -1 : 1);
              if (a.fixed) b.dx += push;
              else if (b.fixed) a.dx -= push;
              else {
                a.dx -= push / 2;
                b.dx += push / 2;
              }
            } else {
              const push = oy * (dy < 0 ? -1 : 1);
              if (a.fixed) b.dy += push;
              else if (b.fixed) a.dy -= push;
              else {
                a.dy -= push / 2;
                b.dy += push / 2;
              }
            }
          }
        }
        if (!moved) break;
      }
      for (const it of items) it.m.setOffset([it.dx, it.dy]);
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
        if (next[id]) continue; // dédupe (mêmes features sur plusieurs tuiles)

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
              const c = m.getLngLat();
              hoverPopup.setLngLat(c).setDOMContent(hoverCard(p)).addTo(map);
              if (p.isGateway === true) drawMesh(nodeId, [c.lng, c.lat]);
            });
            el.addEventListener("mouseleave", () => {
              hoverPopup.remove();
              clearMesh();
            });
            el.addEventListener("click", () =>
              routerRef.current.push(`/node/${encodeURIComponent(nodeId)}`),
            );
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
      // Couche invisible : force le chargement des tuiles de "nodes" pour que
      // querySourceFeatures renvoie les features (le rendu visible = markers HTML).
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
          for (const o of obs) {
            const arr = m.get(o.gatewayId) ?? [];
            arr.push({ nodeId: o.nodeId, hop: o.bestHop ?? 9 });
            m.set(o.gatewayId, arr);
          }
        })
        .catch(() => {});
    });

    map.on("data", (e) => {
      const sourceId = (e as { sourceId?: string }).sourceId;
      if (sourceId === "nodes" && map.isSourceLoaded("nodes")) updateMarkers();
    });
    map.on("move", updateMarkers);
    map.on("moveend", updateMarkers);

    fetch("/api/nodes")
      .then((r) => r.json() as Promise<PublicNode[]>)
      .then((nodes) => {
        nodes.forEach((n) => nodesById.current.set(n.nodeId, nodeFeature(n)));
        refreshNodes();
      })
      .catch(() => {
        /* réseau/DB indispo : la carte reste vide */
      });

    const es = new EventSource("/api/stream");
    es.addEventListener("node_update", (event) => {
      try {
        const n = JSON.parse((event as MessageEvent).data) as NodeUpdate;
        nodesById.current.set(n.nodeId, nodeFeature(n));
        refreshNodes();
      } catch {
        /* payload illisible : on ignore */
      }
    });

    return () => {
      es.close();
      if (meshRaf !== null) cancelAnimationFrame(meshRaf);
      Object.values(markers).forEach((m) => m.remove());
      map.remove();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={zoomRef}
        className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white"
      />
    </div>
  );
}
