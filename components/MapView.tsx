"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl, { type LineLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PublicNode, NodeUpdate, Observation, MapBounds } from "@/types";
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
> & {
  isGateway?: boolean;
  lastSnr?: number | null;
  role?: string | null;
  isMobile?: boolean;
};

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
      role: n.role ?? "",
      isGateway,
      isMobile: n.isMobile ?? false,
      color: nodeColor(n.nodeId, isGateway),
    },
  };
}

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
  if (p.isMobile === true) el.style.borderStyle = "dashed"; // position approximative
  el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";
  el.style.cursor = "pointer";
  el.style.whiteSpace = "nowrap";
  el.style.userSelect = "none";
  el.style.zIndex = isGateway ? "2" : "1";
  // Taille estimée (sans reflow) pour l'anti-superposition. gw : gateway fixe.
  el.dataset.gw = isGateway ? "1" : "0";
  el.dataset.w = String(
    String(p.label ?? "").length * (isGateway ? 8.5 : 7) +
      (isGateway ? 20 : 16),
  );
  el.dataset.h = String(isGateway ? 24 : 20);
  return el;
}

// Bulle de cluster : vert si un gateway dedans, bleu sinon. Taille ∝ nb.
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
  if (p.isMobile === true) {
    const m = document.createElement("div");
    m.style.color = "#999";
    m.textContent = "≈ position approximative";
    el.appendChild(m);
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

export default function MapView({
  bounds,
  minZoom,
}: {
  bounds: MapBounds | null;
  minZoom: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const nodesById = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const obsRef = useRef<Map<string, { nodeId: string; hop: number }[]>>(
    new Map(),
  );
  const bridgeRef = useRef<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [sinceH, setSinceH] = useState(0); // 0 = tous
  const [maxHop, setMaxHop] = useState(9); // 9 = tous (inclut hop inconnu)
  const filtersRef = useRef({ search, role, sinceH, maxHop });
  const refreshRef = useRef<() => void>(() => {});
  // Filtres React → carte : on met à jour le ref + on re-filtre la source.
  useEffect(() => {
    filtersRef.current = { search, role, sinceH, maxHop };
    refreshRef.current();
  }, [search, role, sinceH, maxHop]);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!containerRef.current) return;
    let alive = true;

    // Bornes & zoom mini configurables (settings DB). bounds null = carte
    // ouverte ; sinon on recentre et on bloque le pan hors zone via maxBounds.
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

    //badge de zoom (pour caler le seuil cluster ↔ pastille).
    const showZoom = (): void => {
      if (zoomRef.current)
        zoomRef.current.textContent = `zoom ${map.getZoom().toFixed(2)}`;
    };
    map.on("zoom", showZoom);
    map.once("load", showZoom);

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
    const refreshNodes = (): void => {
      if (!alive) return;
      const { search, role, sinceH } = filtersRef.current;
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

    // Nœud-pont (entendu par ≥2 gateways) → liseré bleu épais (box-shadow ring).
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
          const gwByNode = new Map<string, Set<string>>();
          for (const o of obs) {
            const arr = m.get(o.gatewayId) ?? [];
            arr.push({ nodeId: o.nodeId, hop: o.bestHop ?? 9 });
            m.set(o.gatewayId, arr);
            const set = gwByNode.get(o.nodeId) ?? new Set<string>();
            set.add(o.gatewayId);
            gwByNode.set(o.nodeId, set);
          }
          // Nœud-pont = entendu par ≥2 gateways distincts.
          bridgeRef.current = new Set(
            [...gwByNode].filter(([, s]) => s.size >= 2).map(([n]) => n),
          );
          applyBridge();
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
        const u = JSON.parse((event as MessageEvent).data) as NodeUpdate;
        const existing = nodesById.current.get(u.nodeId);
        if (existing && existing.geometry.type === "Point") {
          // MAJ position/nom/last seen, MAIS préserve isGateway/role/couleur.
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
      } catch {
        /* payload illisible : on ignore */
      }
    });

    return () => {
      alive = false;
      refreshRef.current = () => {};
      es.close();
      if (meshRaf !== null) cancelAnimationFrame(meshRaf);
      Object.values(markers).forEach((m) => m.remove());
      map.remove();
    };
  }, [bounds, minZoom]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={zoomRef}
        className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white sm:bottom-auto sm:top-2"
      />
      <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-black/10 sm:inset-x-auto sm:left-1/2 sm:max-w-[calc(100%-1rem)] sm:-translate-x-1/2 dark:bg-zinc-800/95 dark:text-zinc-100 dark:ring-white/15">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un node…"
          className="min-w-32 flex-1 rounded border border-black/10 bg-transparent px-2 py-1 sm:w-40 sm:flex-none dark:border-white/20"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="min-w-0 flex-1 rounded border border-black/10 bg-transparent px-2 py-1 sm:flex-none dark:border-white/20"
        >
          <option value="">Tous rôles</option>
          {[
            "CLIENT",
            "CLIENT_MUTE",
            "ROUTER",
            "ROUTER_LATE",
            "REPEATER",
            "TRACKER",
            "SENSOR",
          ].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={sinceH}
          onChange={(e) => setSinceH(Number(e.target.value))}
          className="min-w-0 flex-1 rounded border border-black/10 bg-transparent px-2 py-1 sm:flex-none dark:border-white/20"
        >
          <option value={0}>Vus : tous</option>
          <option value={24}>24 h</option>
          <option value={168}>7 j</option>
          <option value={720}>30 j</option>
        </select>
        <select
          value={maxHop}
          onChange={(e) => setMaxHop(Number(e.target.value))}
          className="min-w-0 flex-1 rounded border border-black/10 bg-transparent px-2 py-1 sm:flex-none dark:border-white/20"
        >
          <option value={9}>Toile : tous hops</option>
          <option value={0}>direct (0-hop)</option>
          <option value={1}>≤ 1 hop</option>
          <option value={2}>≤ 2 hops</option>
          <option value={3}>≤ 3 hops</option>
        </select>
      </div>
    </div>
  );
}
