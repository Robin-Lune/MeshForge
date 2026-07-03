"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { NodeMapLink, NodeTraceroute, TracerouteHop } from "@/types";
import { signalColor } from "@/components/map/signal-color";
import {
  SUBJECT_COLOR,
  buildLinkFeatures,
  buildNodeFeatures,
  fmtSnr,
  locatedNeighbors,
  nodeLabel as label,
  splitHops,
} from "@/components/node-neighborhood-data";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const TYPE_LABELS: Record<string, string> = {
  position: "Position",
  nodeinfo: "NodeInfo",
  telemetry: "Télémétrie",
  neighborinfo: "NeighborInfo",
  traceroute: "Traceroute",
  text: "Texte",
  map_report: "Map report",
  autre: "Autre",
};
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t;
const hopLabel = (h: number | null) => (h === 0 ? "direct" : h == null ? "—" : `${h} hop${h > 1 ? "s" : ""}`);

type Props = {
  node: { nodeId: string; name: string; lat: number | null; lon: number | null };
  links: NodeMapLink[];
  traceroutes: NodeTraceroute[];
};

export default function NodeNeighborhood({ node, links, traceroutes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [type, setType] = useState<string>("all");

  const availableTypes = [...new Set(links.flatMap((l) => Object.keys(l.types)))].sort();
  const filtered = type === "all" ? links : links.filter((l) => l.types[type]);
  const located = locatedNeighbors(filtered);
  const hasPos = node.lat != null && node.lon != null;
  const locatedKey = located.map((l) => l.nodeId).join(",");

  const buildLinks = (h: string | null) => buildLinkFeatures(node, located, h);
  const buildNodes = () => buildNodeFeatures(node, located);
  const fit = () => {
    const map = mapRef.current;
    if (!map) return;
    if (located.length === 0) {
      map.jumpTo({ center: [node.lon as number, node.lat as number], zoom: 11 });
      return;
    }
    const b = new maplibregl.LngLatBounds();
    b.extend([node.lon as number, node.lat as number]);
    located.forEach((n) => b.extend([n.lon as number, n.lat as number]));
    map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 0 });
  };

  // Init de la carte (une fois). Sources/couches ajoutées au 'load'.
  useEffect(() => {
    if (!containerRef.current || !hasPos) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [node.lon as number, node.lat as number],
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on("load", () => {
      map.addSource("nb-links", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("nb-nodes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "nb-links",
        type: "line",
        source: "nb-links",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "dim"], 1.5, 3],
          "line-opacity": ["case", ["get", "dim"], 0.2, 0.9],
        },
      });
      map.addLayer({
        id: "nb-nodes",
        type: "circle",
        source: "nb-nodes",
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "subject"], 8, 6],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "nb-labels",
        type: "symbol",
        source: "nb-nodes",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
        },
        paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });
      map.on("mousemove", "nb-nodes", (e) => {
        const p = e.features?.[0]?.properties;
        if (p?.kind === "neighbor" && typeof p.nodeId === "string") {
          map.getCanvas().style.cursor = "pointer";
          setHovered(p.nodeId);
        }
      });
      map.on("mouseleave", "nb-nodes", () => {
        map.getCanvas().style.cursor = "";
        setHovered(null);
      });
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPos]);

  // Données + cadrage : au chargement et quand le filtre change la liste.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("nb-nodes") as maplibregl.GeoJSONSource | undefined)?.setData(buildNodes());
    (map.getSource("nb-links") as maplibregl.GeoJSONSource | undefined)?.setData(buildLinks(hovered));
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locatedKey]);

  // Survol -> estompe les autres liens.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("nb-links") as maplibregl.GeoJSONSource | undefined)?.setData(buildLinks(hovered));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);

  if (links.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Aucun lien connu (ce nœud n&apos;a capté aucun autre nœud et n&apos;a émis aucun NeighborInfo sur 30 j).
      </p>
    );
  }

  const trace = hovered != null ? traceroutes.find((t) => t.otherNode === hovered) ?? null : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="nb-type" className="text-zinc-500">
          Type de paquet
        </label>
        <select
          id="nb-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-black/10 bg-transparent px-2 py-1 dark:border-white/20"
        >
          <option value="all">Tous</option>
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-400">{filtered.length} lien(s)</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {hasPos ? (
            <div
              ref={containerRef}
              className="isolate h-64 w-full overflow-hidden rounded-lg border border-black/10 sm:h-80 dark:border-white/15"
            />
          ) : (
            <p className="rounded-lg border border-black/10 p-4 text-sm text-zinc-400 dark:border-white/15">
              Carte indisponible : ce nœud n&apos;a pas de position connue.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <LegendDot color={SUBJECT_COLOR} text="Ce nœud" />
            <LegendDot color="#00ff00" text="Bon (> −7 dB)" />
            <LegendDot color="#ffe600" text="Moyen" />
            <LegendDot color="#f7931a" text="Faible (< −15 dB)" />
            <LegendDot color="#9ca3af" text="SNR inconnu" />
          </div>
        </div>

        <div className="min-w-0">
          <ul className="max-h-72 divide-y divide-black/5 overflow-auto rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
            {filtered.map((l) => (
              <li
                key={l.nodeId}
                onMouseEnter={() => setHovered(l.nodeId)}
                onMouseLeave={() => setHovered(null)}
                className={`flex items-center justify-between gap-3 px-3 py-1.5 text-sm ${
                  hovered === l.nodeId ? "bg-black/5 dark:bg-white/10" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full ring-1 ring-black/20"
                    style={{ background: signalColor(l.snr) }}
                  />
                  <a href={`/node/${encodeURIComponent(l.nodeId)}`} className="truncate hover:underline">
                    {label(l.nodeId, l.name)}
                  </a>
                </span>
                <span className="flex flex-none items-center gap-2 font-mono text-xs text-zinc-500">
                  <span className={l.hop === 0 ? "text-emerald-600" : ""}>{hopLabel(l.hop)}</span>
                  <span>{fmtSnr(l.snr)}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
            <h4 className="mb-2 text-xs font-semibold text-zinc-500">Traceroute</h4>
            {trace ? (
              <TraceroutePath trace={trace} />
            ) : (
              <p className="text-xs text-zinc-400">
                {hovered
                  ? "Aucun traceroute disponible pour ce nœud (traceroute passif)."
                  : "Survolez un nœud pour voir le chemin traceroute (si disponible)."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/20" style={{ background: color }} />
      {text}
    </span>
  );
}

function TraceroutePath({ trace }: { trace: NodeTraceroute }) {
  const { forward, back } = splitHops(trace.hops);
  return (
    <div className="space-y-2">
      <HopList title="Aller" hops={forward} />
      {back.length > 0 && <HopList title="Retour" hops={back} />}
    </div>
  );
}

function HopList({ title, hops }: { title: string; hops: TracerouteHop[] }) {
  if (hops.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-medium text-zinc-400">{title}</div>
      <ul className="mt-1 space-y-0.5">
        {hops.map((h) => (
          <li key={`${h.direction}-${h.step}`} className="flex items-center justify-between gap-2 font-mono text-xs">
            <span className="truncate">
              {label(h.fromNode, h.fromName)} <span className="text-zinc-400">→</span>{" "}
              {label(h.toNode, h.toName)}
            </span>
            <span className="flex-none text-zinc-500">{fmtSnr(h.snr)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
