"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import type { PublicNode, NodeUpdate, Observation, ReachEdge, MapBounds } from "@/types";
import {
  nodeFeature,
  shortLabel,
  lerp,
  lineFeature,
} from "@/components/map/map-data";
import type { LngLat } from "@/components/map/map-data";
import { resolvePillSpread } from "@/components/map/pill-spread";
import {
  clusterElement,
  hoverCard,
  pillElement,
} from "@/components/map/map-dom";
import {
  MESH_DIRECT_LAYER,
  MESH_RELAY_LAYER,
  MESH_BADGE_LAYER,
} from "@/components/map/map-layers";
import { haversineKm } from "@/lib/geo";
import type { HopFilter } from "@/components/map/MapFilters";

// Au-delà de cette distance, un lien est probablement un artefact (GPS erroné /
// module itinérant) vu la portée LoRa à La Réunion : masqué sauf toggle.
const FAR_LINK_KM = 20;

const REUNION_CENTER: [number, number] = [55.536, -21.115];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type MapFiltersState = {
  search: string;
  role: string;
  sinceH: number;
  hopFilter: HopFilter;
  showFarLinks: boolean; // afficher aussi les liens > 20 km (artefacts probables)
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
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const nodesById = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const obsRef = useRef<Map<string, { nodeId: string; hop: number; packets: number }[]>>(
    new Map(),
  );
  const minHopRef = useRef<Map<string, number>>(new Map());
  const bridgeRef = useRef<Set<string>>(new Set());
  // node -> gateways qui l'ont entendu (pour recalculer l'anneau "pont" en
  // tenant compte du filtre 20 km, cohérent avec les liens au survol).
  const heardByRef = useRef<Map<string, Set<string>>>(new Map());
  const bridgeSyncRef = useRef<() => void>(() => {});
  // Arêtes NeighborInfo/Traceroute (brutes) + index d'atteignabilité NON-orienté
  // pour le survol : nodeId -> nœuds atteints (paquet direct 2 sens + reach).
  const reachEdgesRef = useRef<ReachEdge[]>([]);
  const hoverLinkRef = useRef<
    Map<string, { nodeId: string; hop: number; packets: number }[]>
  >(new Map());
  const filtersRef = useRef(filters);
  const refreshRef = useRef<() => void>(() => {});
  const router = useRouter();
  const routerRef = useRef(router);
  const updateRoleOptions = (): void => {
    const roles = new Set<string>();
    for (const f of nodesById.current.values()) {
      const role = (f.properties as Record<string, unknown> | null)?.role;
      if (typeof role === "string" && role.trim()) roles.add(role);
    }
    setRoleOptions([...roles].sort((a, b) => a.localeCompare(b)));
  };
  const matchesHopFilter = (hop: number | undefined, filter: HopFilter) => {
    if (filter === "all") return true;
    if (hop === undefined) return false;
    if (filter === "3plus") return hop >= 3;
    return hop === Number(filter);
  };

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    filtersRef.current = filters;
    refreshRef.current();
    bridgeSyncRef.current(); // le toggle 20 km change aussi l'anneau "pont"
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
      m: maplibregl.Marker,
    ): void => {
      const card = hoverCard(p);
      card.style.cursor = "pointer";
      card.addEventListener("click", (event) => {
        event.stopPropagation();
        routerRef.current.push(`/node/${encodeURIComponent(nodeId)}`);
      });
      // spreadPills écarte les pastilles empilées en pixels (setOffset) sans
      // toucher leur position géo : on ancre le popup sur la position VISUELLE
      // de la pastille survolée, sinon il se centre sur le milieu de la pile
      // (chevauche le pointeur -> flickering).
      const base = map.project(m.getLngLat());
      const off = m.getOffset();
      const anchor = map.unproject([base.x + off.x, base.y + off.y]);
      hoverPopup.setLngLat(anchor).setDOMContent(card).addTo(map);
    };

    const nodesSource = (): maplibregl.GeoJSONSource | undefined =>
      alive
        ? (map.getSource("nodes") as maplibregl.GeoJSONSource | undefined)
        : undefined;
    const refreshNodes = (): void => {
      if (!alive) return;
      const { search, role, sinceH, hopFilter } = filtersRef.current;
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
        if (hopFilter !== "all") {
          if (hopFilter === "0" && p.isGateway === true) return true;
          const mh = minHopRef.current.get(p.nodeId as string);
          if (!matchesHopFilter(mh, hopFilter)) return false;
        }
        return true;
      });
      nodesSource()?.setData({ type: "FeatureCollection", features });
    };
    refreshRef.current = refreshNodes;
    let observationsTimer: number | null = null;
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
    // Toutes les arêtes du nœud survolé (paquet direct 2 sens + NeighborInfo +
    // Traceroute), au hop MINIMAL et au compteur de paquets MAX par nœud atteint.
    // Couleurs = code hop existant. Liens > 20 km masqués sauf toggle. Badge du
    // nombre de paquets au milieu du lien.
    const drawMesh = (nodeId: string, gw: LngLat): void => {
      const src = meshSource();
      if (!src) return;
      const { hopFilter, showFarLinks } = filtersRef.current;
      const best = new Map<string, { hop: number; packets: number }>();
      for (const e of hoverLinkRef.current.get(nodeId) ?? []) {
        const prev = best.get(e.nodeId);
        if (prev === undefined) best.set(e.nodeId, { hop: e.hop, packets: e.packets });
        else best.set(e.nodeId, { hop: Math.min(prev.hop, e.hop), packets: Math.max(prev.packets, e.packets) });
      }
      const targets = [...best.entries()]
        .filter(([, v]) => matchesHopFilter(v.hop, hopFilter))
        .map(([id, v]) => ({ hop: v.hop, packets: v.packets, pos: posById(id) }))
        .filter((t): t is { hop: number; packets: number; pos: LngLat } => t.pos !== null)
        .filter((t) => showFarLinks || haversineKm(gw[1], gw[0], t.pos[1], t.pos[0]) <= FAR_LINK_KM);
      if (!targets.length) return;
      const start = performance.now();
      const ease = (p: number): number => 1 - (1 - p) * (1 - p);
      const step = (now: number): void => {
        const p = ease(Math.min((now - start) / 550, 1));
        const features: GeoJSON.Feature[] = [];
        for (const t of targets) {
          const end = lerp(gw, t.pos, p);
          features.push(lineFeature(gw, end, t.hop));
          if (t.packets > 0) {
            const mid = lerp(gw, end, 0.5);
            features.push({
              type: "Feature",
              properties: { packets: t.packets },
              geometry: { type: "Point", coordinates: mid },
            });
          }
        }
        src.setData({ type: "FeatureCollection", features });
        if (p < 1) meshRaf = requestAnimationFrame(step);
      };
      meshRaf = requestAnimationFrame(step);
    };

    const markers: Record<string, maplibregl.Marker> = {};
    let onScreen: Record<string, maplibregl.Marker> = {};

    const spreadPills = (): void => {
      const ids = Object.keys(onScreen).filter((id) => id.startsWith("n"));
      const boxes = ids.map((id) => {
        const el = onScreen[id].getElement();
        const pt = map.project(onScreen[id].getLngLat());
        return {
          x: pt.x,
          y: pt.y,
          w: Number(el.dataset.w) || 40,
          h: Number(el.dataset.h) || 22,
        };
      });
      const offsets = resolvePillSpread(boxes);
      ids.forEach((id, i) => onScreen[id].setOffset([offsets[i].dx, offsets[i].dy]));
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

        let marker: maplibregl.Marker | undefined = markers[id];
        const gatewayState = isCluster
          ? Number(p.hasGateway ?? 0) > 0
          : p.isGateway === true;
        if (marker?.getElement().dataset.gateway !== String(gatewayState)) {
          marker?.remove();
          delete markers[id];
          marker = undefined;
        }
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
              openNodePopup(nodeId, p, m);
              // Survol de N'IMPORTE QUEL nœud : ses arêtes (direct + NeighborInfo
              // + Traceroute) ; drawMesh ne dessine rien s'il n'en a aucune.
              drawMesh(nodeId, [c.lng, c.lat]);
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
              openNodePopup(nodeId, p, m);
              clearMesh();
              drawMesh(nodeId, [c.lng, c.lat]);
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

    const loadObservations = (): void => {
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
            arr.push({ nodeId: o.nodeId, hop, packets: o.packets });
            m.set(o.gatewayId, arr);
            const prev = minHop.get(o.nodeId);
            if (prev === undefined || hop < prev) minHop.set(o.nodeId, hop);
            const set = gwByNode.get(o.nodeId) ?? new Set<string>();
            set.add(o.gatewayId);
            gwByNode.set(o.nodeId, set);
          }
          heardByRef.current = gwByNode;
          computeBridges();
          rebuildHover();
          refreshNodes();
        })
        .catch(() => {});
    };

    // Anneau "vu par plusieurs gateways" : un node est un pont s'il est entendu
    // par >= 2 gateways À MOINS DE 20 km (ou toutes si le toggle est actif),
    // cohérent avec l'affichage des liens au survol. Nécessite les positions.
    const computeBridges = (): void => {
      const { showFarLinks } = filtersRef.current;
      const bridges = new Set<string>();
      for (const [node, gws] of heardByRef.current) {
        const np = posById(node);
        if (!np) continue;
        let count = 0;
        for (const gw of gws) {
          if (gw === node) continue;
          const gp = posById(gw);
          if (!gp) continue;
          if (showFarLinks || haversineKm(np[1], np[0], gp[1], gp[0]) <= FAR_LINK_KM) count++;
        }
        if (count >= 2) bridges.add(node);
      }
      bridgeRef.current = bridges;
      applyBridge();
    };
    bridgeSyncRef.current = computeBridges;

    // Index ORIENTÉ pour le survol (from -> to). Au survol d'un nœud X on lit
    // h[X] = liens sortants, coloriés au MEILLEUR hop du sens X->Y sur la fenêtre.
    //  - Observations : réception ~symétrique, ajoutée dans les deux sens.
    //  - Reach (NeighborInfo/Traceroute) : déjà orientée. Le traceroute donne
    //    l'asymétrie (A->C 1 hop via un relais, C->A 0 hop en direct).
    const rebuildHover = (): void => {
      const h = new Map<string, { nodeId: string; hop: number; packets: number }[]>();
      const add = (a: string, b: string, hop: number, packets: number): void => {
        const arr = h.get(a) ?? [];
        arr.push({ nodeId: b, hop, packets });
        h.set(a, arr);
      };
      for (const [gw, list] of obsRef.current) {
        for (const e of list) {
          add(gw, e.nodeId, e.hop, e.packets); // ce que gw a entendu
          add(e.nodeId, gw, e.hop, e.packets); // sens inverse
        }
      }
      for (const e of reachEdgesRef.current) {
        // NeighborInfo / Traceroute : révèlent le lien, pas un compte de paquets.
        add(e.fromId, e.toId, e.hop, 0);
      }
      hoverLinkRef.current = h;
    };

    const loadReach = (): void => {
      fetch("/api/reach")
        .then((r) => r.json() as Promise<ReachEdge[]>)
        .then((edges) => {
          reachEdgesRef.current = edges;
          rebuildHover();
        })
        .catch(() => {});
    };

    const scheduleObservationsRefresh = (): void => {
      if (observationsTimer !== null) window.clearTimeout(observationsTimer);
      observationsTimer = window.setTimeout(loadObservations, 1500);
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
      map.addLayer(MESH_BADGE_LAYER);
      refreshNodes();
      loadObservations();
      loadReach();
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
        updateRoleOptions();
        computeBridges(); // positions dispo -> recalcul de l'anneau (distance)
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
          p.role = u.role ?? p.role;
          p.isGateway = u.isGateway;
          p.label = shortLabel(
            u.nodeId,
            (u.shortName ?? p.shortName) as string,
          );
          p.lastSeen = u.lastSeen ?? "";
        } else {
          nodesById.current.set(u.nodeId, nodeFeature(u));
        }
        updateRoleOptions();
        refreshNodes();
        scheduleObservationsRefresh();
      } catch {}
    });

    return () => {
      alive = false;
      refreshRef.current = () => {};
      es.close();
      if (observationsTimer !== null) window.clearTimeout(observationsTimer);
      if (meshRaf !== null) cancelAnimationFrame(meshRaf);
      Object.values(markers).forEach((m) => m.remove());
      map.remove();
    };
  }, [bounds, containerRef, minZoom]);

  return { roleOptions };
}
