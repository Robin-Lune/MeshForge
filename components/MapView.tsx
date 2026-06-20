"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PublicNode, NodeUpdate } from "@/types";

// Centre approximatif de La Réunion [lng, lat].
const REUNION_CENTER: [number, number] = [55.536, -21.115];
// OpenFreeMap : style vectoriel sans clé. À remplacer par un .pmtiles
// self-hosté (Protomaps) avant la mise en prod communautaire (cf. docs).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Champs communs à PublicNode (fetch initial) et NodeUpdate (SSE temps réel).
type MarkerNode = Pick<
  PublicNode,
  "nodeId" | "longName" | "shortName" | "lat" | "lon" | "batteryPct" | "lastSeen"
>;

// Popup construite via le DOM (textContent) plutôt que setHTML : les noms de
// nodes viennent du mesh (non fiables) — pas d'injection HTML possible.
function popupContent(n: MarkerNode): HTMLElement {
  const el = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = n.longName ?? n.shortName ?? n.nodeId;
  el.appendChild(title);

  const meta = document.createElement("div");
  const parts = [n.nodeId];
  if (n.batteryPct !== null) parts.push(`🔋 ${n.batteryPct}%`);
  if (n.lastSeen) parts.push(`vu ${new Date(n.lastSeen).toLocaleString("fr-FR")}`);
  meta.textContent = parts.join(" · ");
  el.appendChild(meta);
  return el;
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: REUNION_CENTER,
      zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    // Crée ou déplace le marker d'un node (fetch initial OU update SSE).
    const upsertMarker = (n: MarkerNode): void => {
      const lngLat: [number, number] = [n.lon, n.lat];
      const existing = markersRef.current.get(n.nodeId);
      if (existing) {
        existing.setLngLat(lngLat);
        existing.getPopup()?.setDOMContent(popupContent(n));
        return;
      }
      const popup = new maplibregl.Popup({ offset: 24 }).setDOMContent(popupContent(n));
      const marker = new maplibregl.Marker().setLngLat(lngLat).setPopup(popup).addTo(map);
      markersRef.current.set(n.nodeId, marker);
    };

    // Chargement initial des nodes publics.
    fetch("/api/nodes")
      .then((r) => r.json() as Promise<PublicNode[]>)
      .then((nodes) => nodes.forEach(upsertMarker))
      .catch(() => {
        /* réseau/DB indispo : la carte reste vide */
      });

    // Mises à jour temps réel (SSE).
    const es = new EventSource("/api/stream");
    es.addEventListener("node_update", (e) => {
      try {
        upsertMarker(JSON.parse((e as MessageEvent).data) as NodeUpdate);
      } catch {
        /* payload illisible : on ignore */
      }
    });

    const markers = markersRef.current;
    return () => {
      es.close();
      markers.forEach((m) => m.remove());
      markers.clear();
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
