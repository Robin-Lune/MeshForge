"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import type {
  CoverageResponse,
  CoverageSelection,
  MapBounds,
  NodeUpdate,
  ObservationsResponse,
  PublicNode,
} from "@/types";
import { nodeFeature, shortLabel, type LngLat } from "./map-data";
import {
  MESH_BADGE_LAYER,
  MESH_DIRECT_LAYER,
  MESH_RELAY_LAYER,
} from "./map-layers";
import {
  createNodeMarkerController,
  type NodeMapFilters,
  type NodeMarkerController,
} from "./node-marker-controller";
import {
  bridgeNodeIds,
  indexGatewayActivity,
  indexObservations,
  type ObservationIndex,
} from "./observation-index";
import {
  createCoverageController,
  type CoverageController,
} from "./coverage-controller";

// Au-delà de cette distance, un lien est probablement un artefact (GPS erroné /
// module itinérant) vu la portée LoRa à La Réunion : masqué automatiquement.
const FAR_LINK_KM = 20;
// Le palier le plus court et la fenêtre du compteur valent une heure.
const FRESHNESS_TICK_MS = 60_000;
const REUNION_CENTER: [number, number] = [55.536, -21.115];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type MapFiltersState = NodeMapFilters & {
  coverage: CoverageSelection;
};

type UseMapControllerProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  bounds: MapBounds | null;
  minZoom: number;
  filters: MapFiltersState;
};

const emptyObservationIndex = (): ObservationIndex => ({
  minHopByNode: new Map(),
  heardByNode: new Map(),
  hoverByNode: new Map(),
});

export function useMapController({
  containerRef,
  bounds,
  minZoom,
  filters,
}: UseMapControllerProps) {
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  // Une panne de /api/coverage doit être distinguée d'une carte sans mesure.
  const [coverageError, setCoverageError] = useState(false);
  const [clustersVisible, setClustersVisible] = useState(false);

  const nodesById = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const observationsRef = useRef<ObservationIndex>(emptyObservationIndex());
  const directCountsRef = useRef<Map<string, number>>(new Map());
  const bridgesRef = useRef<Set<string>>(new Set());
  const coverageCacheRef = useRef<CoverageResponse | null>(null);
  const filtersRef = useRef(filters);
  const nodeControllerRef = useRef<NodeMarkerController | null>(null);
  const coverageControllerRef = useRef<CoverageController | null>(null);

  const router = useRouter();
  const routerRef = useRef(router);

  const updateRoleOptions = (): void => {
    const roles = new Set<string>();
    for (const feature of nodesById.current.values()) {
      const role = (feature.properties as Record<string, unknown> | null)?.role;
      if (typeof role === "string" && role.trim()) roles.add(role);
    }
    setRoleOptions([...roles].sort((a, b) => a.localeCompare(b)));
  };

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    filtersRef.current = filters;
    nodeControllerRef.current?.refreshNodes();
    nodeControllerRef.current?.applyBridgeHighlight();
    coverageControllerRef.current?.sync();
  }, [filters]);

  useEffect(() => {
    if (!containerRef.current) return;
    let alive = true;
    let observationsTimer: number | null = null;

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

    const positionOf = (nodeId: string): LngLat | null => {
      const feature = nodesById.current.get(nodeId);
      return feature?.geometry.type === "Point"
        ? (feature.geometry.coordinates as LngLat)
        : null;
    };

    const nodeController = createNodeMarkerController({
      map,
      tapToPreview: window.matchMedia(
        "(hover: none), (pointer: coarse)",
      ).matches,
      maxLinkDistanceKm: FAR_LINK_KM,
      nodes: nodesById.current,
      getFilters: () => filtersRef.current,
      getMinHopByNode: () => observationsRef.current.minHopByNode,
      getBridgeNodeIds: () => bridgesRef.current,
      getHoverByNode: () => observationsRef.current.hoverByNode,
      getDirectCountByGateway: () => directCountsRef.current,
      onOpenNode: (nodeId) =>
        routerRef.current.push(`/node/${encodeURIComponent(nodeId)}`),
      onClustersChange: setClustersVisible,
    });
    nodeControllerRef.current = nodeController;

    const coverageController = createCoverageController({
      map,
      getSelection: () => filtersRef.current.coverage,
      getCachedCoverage: () => coverageCacheRef.current,
      setCachedCoverage: (coverage) => {
        coverageCacheRef.current = coverage;
      },
      isNodePopupOpen: nodeController.popupIsOpen,
      onErrorChange: setCoverageError,
    });
    coverageControllerRef.current = coverageController;

    const computeBridges = (): void => {
      if (!alive) return;
      bridgesRef.current = bridgeNodeIds(
        observationsRef.current.heardByNode,
        positionOf,
        FAR_LINK_KM,
      );
      nodeController.applyBridgeHighlight();
    };

    // Le tick périodique et le rafraîchissement débouncé du SSE peuvent se
    // croiser : sans numéro de séquence, une réponse lente écrase une réponse
    // plus récente déjà appliquée.
    let observationsSeq = 0;

    const loadObservations = (): void => {
      const seq = ++observationsSeq;
      fetch("/api/observations")
        .then((response) => response.json() as Promise<ObservationsResponse>)
        .then((payload) => {
          if (!alive || seq !== observationsSeq) return;
          observationsRef.current = indexObservations(payload.edges);
          directCountsRef.current = indexGatewayActivity(
            payload.gatewayActivity,
          );
          computeBridges();
          nodeController.refreshNodes();
          nodeController.applyFreshness();
        })
        .catch(() => {});
    };

    const scheduleObservationsRefresh = (): void => {
      if (observationsTimer !== null) window.clearTimeout(observationsTimer);
      observationsTimer = window.setTimeout(loadObservations, 1500);
    };

    map.on("load", () => {
      if (!alive) return;
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

      coverageController.install();
      map.addLayer({
        id: "nodes-hit",
        type: "circle",
        source: "nodes",
        paint: { "circle-radius": 1, "circle-opacity": 0 },
      });
      map.addLayer(MESH_DIRECT_LAYER);
      map.addLayer(MESH_RELAY_LAYER);
      map.addLayer(MESH_BADGE_LAYER);

      nodeController.refreshNodes();
      loadObservations();
    });

    map.on("data", (event) => {
      const sourceId = (event as { sourceId?: string }).sourceId;
      if (sourceId === "nodes" && map.isSourceLoaded("nodes")) {
        nodeController.updateMarkers();
      }
    });
    map.on("click", nodeController.clearSelection);
    map.on("move", nodeController.updateMarkers);
    map.on("moveend", nodeController.updateMarkers);

    fetch("/api/nodes")
      .then((response) => response.json() as Promise<PublicNode[]>)
      .then((nodes) => {
        if (!alive) return;
        nodes.forEach((node) =>
          nodesById.current.set(node.nodeId, nodeFeature(node)),
        );
        updateRoleOptions();
        computeBridges();
        nodeController.refreshNodes();
      })
      .catch(() => {});

    const eventSource = new EventSource("/api/stream");
    eventSource.addEventListener("node_update", (event) => {
      if (!alive) return;
      try {
        const update = JSON.parse((event as MessageEvent).data) as NodeUpdate;
        const existing = nodesById.current.get(update.nodeId);
        if (existing?.geometry.type === "Point") {
          existing.geometry.coordinates = [update.lon, update.lat];
          const properties = existing.properties as Record<string, unknown>;
          properties.longName = update.longName ?? properties.longName;
          properties.shortName = update.shortName ?? properties.shortName;
          properties.role = update.role ?? properties.role;
          properties.isGateway = update.isGateway;
          properties.label = shortLabel(
            update.nodeId,
            (update.shortName ?? properties.shortName) as string,
          );
          // NodeUpdate.lastSeen est nullable : l'écraser par "" ferait passer au
          // palier le plus ancien un node qui vient précisément de parler, et
          // le ferait disparaître sous le filtre « depuis N h ».
          properties.lastSeen = update.lastSeen ?? properties.lastSeen;
        } else {
          nodesById.current.set(update.nodeId, nodeFeature(update));
        }
        updateRoleOptions();
        nodeController.refreshNodes();
        nodeController.applyFreshness();
        scheduleObservationsRefresh();
      } catch {}
    });

    // Le temps qui passe suffit à périmer la couleur et à vider la fenêtre d'une
    // heure du compteur : aucun événement serveur ne les rafraîchirait. Repeint
    // toujours (gratuit, local), mais ne requête pas un onglet masqué.
    const freshnessTimer = window.setInterval(() => {
      nodeController.applyFreshness();
      if (!document.hidden) loadObservations();
    }, FRESHNESS_TICK_MS);

    // Sans ce rattrapage, un onglet masqué plusieurs heures revient avec des
    // compteurs périmés jusqu'au tick suivant.
    const onVisibility = (): void => {
      if (!document.hidden) loadObservations();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      if (nodeControllerRef.current === nodeController) {
        nodeControllerRef.current = null;
      }
      if (coverageControllerRef.current === coverageController) {
        coverageControllerRef.current = null;
      }
      eventSource.close();
      window.clearInterval(freshnessTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (observationsTimer !== null) {
        window.clearTimeout(observationsTimer);
      }
      coverageController.destroy();
      nodeController.destroy();
      map.remove();
    };
  }, [bounds, containerRef, minZoom]);

  return { roleOptions, coverageError, clustersVisible };
}
