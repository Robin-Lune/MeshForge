"use client";

import { useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CoverageSelection, MapBounds } from "@/types";
import { MapFilters } from "@/components/map/MapFilters";
import type { HopFilter } from "@/components/map/MapFilters";
import { MapLegend } from "@/components/map/MapLegend";
import { useMapController } from "@/components/map/useMapController";

export default function MapView({
  bounds,
  minZoom,
}: {
  bounds: MapBounds | null;
  minZoom: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [sinceH, setSinceH] = useState(0); // 0 = tous
  const [hopFilter, setHopFilter] = useState<HopFilter>("all");
  const [legendOpen, setLegendOpen] = useState(true);
  // Couche de couverture : « off » par défaut. Elle répond à une question
  // d'exploitation (« où poser un relais ? »), pas à la consultation courante.
  const [coverage, setCoverage] = useState<CoverageSelection>("off");
  const filters = useMemo(
    () => ({ search, role, sinceH, hopFilter, coverage }),
    [search, role, sinceH, hopFilter, coverage],
  );

  const { roleOptions, coverageError } = useMapController({
    containerRef,
    bounds,
    minZoom,
    filters,
  });

  return (
    <div className="mf-map relative h-full w-full">
      {/* isolate : cantonne les marqueurs MapLibre (z-index interne) dans leur
          propre contexte d'empilement -> ils ne passent plus au-dessus des
          panneaux (filtres, légende) posés après dans le DOM. */}
      <div ref={containerRef} className="isolate h-full w-full" />
      <MapLegend
        open={legendOpen}
        onToggle={() => setLegendOpen((open) => !open)}
        coverage={coverage}
        coverageError={coverageError}
      />
      <MapFilters
        search={search}
        role={role}
        roleOptions={roleOptions}
        sinceH={sinceH}
        hopFilter={hopFilter}
        onSearchChange={setSearch}
        onRoleChange={setRole}
        onSinceHChange={setSinceH}
        onHopFilterChange={setHopFilter}
        coverage={coverage}
        onCoverageChange={setCoverage}
      />
    </div>
  );
}
