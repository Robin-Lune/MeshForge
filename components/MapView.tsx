"use client";

import { useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapBounds } from "@/types";
import { MapFilters } from "@/components/map/MapFilters";
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
  const [maxHop, setMaxHop] = useState(9); // 9 = tous (inclut hop inconnu)
  const [legendOpen, setLegendOpen] = useState(true);
  const filters = useMemo(
    () => ({ search, role, sinceH, maxHop }),
    [search, role, sinceH, maxHop],
  );

  useMapController({ containerRef, bounds, minZoom, filters });

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <MapLegend
        open={legendOpen}
        onToggle={() => setLegendOpen((open) => !open)}
      />
      <MapFilters
        search={search}
        role={role}
        sinceH={sinceH}
        maxHop={maxHop}
        onSearchChange={setSearch}
        onRoleChange={setRole}
        onSinceHChange={setSinceH}
        onMaxHopChange={setMaxHop}
      />
    </div>
  );
}
