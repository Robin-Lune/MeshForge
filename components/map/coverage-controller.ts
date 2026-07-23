// SPDX-License-Identifier: AGPL-3.0-or-later
import maplibregl from "maplibre-gl";
import type { CoverageResponse, CoverageSelection } from "@/types";
import {
  COVERAGE_FILL_ID,
  COVERAGE_FILL_LAYER,
  COVERAGE_LINE_ID,
  COVERAGE_LINE_LAYER,
  COVERAGE_SOURCE,
  toCoverageGeoJSON,
} from "./coverage-layer";
import { coverageCard } from "./map-dom";

const RETRY_COOLDOWN_MS = 30_000;

type CoverageControllerOptions = {
  map: maplibregl.Map;
  getSelection: () => CoverageSelection;
  getCachedCoverage: () => CoverageResponse | null;
  setCachedCoverage: (coverage: CoverageResponse) => void;
  isNodePopupOpen: () => boolean;
  onErrorChange: (failed: boolean) => void;
};

export type CoverageController = {
  install: () => void;
  sync: () => void;
  destroy: () => void;
};

export function createCoverageController({
  map,
  getSelection,
  getCachedCoverage,
  setCachedCoverage,
  isNodePopupOpen,
  onErrorChange,
}: CoverageControllerOptions): CoverageController {
  let alive = true;
  let fetching = false;
  let failedAt = 0;
  let hoveredTile: string | null = null;
  let paintedMetric: CoverageSelection | null = null;
  let paintedData: CoverageResponse | null = null;

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 8,
    className: "mf-popup",
  });

  // Chargement paresseux : aucune requête tant que la couche reste éteinte.
  // Le cache appartient au hook pour survivre à un remontage de la carte.
  const load = (): void => {
    if (fetching || getCachedCoverage()) return;
    if (failedAt && Date.now() - failedAt < RETRY_COOLDOWN_MS) return;

    fetching = true;
    fetch("/api/coverage")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CoverageResponse>;
      })
      .then((coverage) => {
        if (!alive) return;
        failedAt = 0;
        setCachedCoverage(coverage);
        onErrorChange(false);
        sync();
      })
      .catch((error) => {
        if (!alive) return;
        failedAt = Date.now();
        onErrorChange(true);
        console.error("[couverture] chargement impossible :", error);
      })
      .finally(() => {
        fetching = false;
      });
  };

  // Une recherche de node ne doit pas reconstruire des milliers de polygones :
  // on ne repeint que si la métrique ou la réponse de couverture a changé.
  const sync = (): void => {
    if (!alive) return;
    const source = map.getSource(COVERAGE_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const selection = getSelection();
    const visible = selection !== "off";
    for (const layerId of [COVERAGE_FILL_ID, COVERAGE_LINE_ID]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          visible ? "visible" : "none",
        );
      }
    }

    if (!visible) {
      hoveredTile = null;
      popup.remove();
      return;
    }

    const coverage = getCachedCoverage();
    if (!coverage) {
      load();
      return;
    }
    if (paintedMetric === selection && paintedData === coverage) return;

    source.setData(toCoverageGeoJSON(coverage.tiles, coverage.z, selection));
    paintedMetric = selection;
    paintedData = coverage;
  };

  const handleMouseMove = (event: maplibregl.MapLayerMouseEvent): void => {
    const feature = event.features?.[0];
    if (!feature || isNodePopupOpen()) return;

    map.getCanvas().style.cursor = "crosshair";
    const properties = feature.properties as Record<string, unknown>;
    const tileKey = `${properties.x}/${properties.y}`;
    if (tileKey !== hoveredTile) {
      hoveredTile = tileKey;
      popup.setDOMContent(
        coverageCard(properties, getCachedCoverage()?.z ?? 0),
      );
    }
    popup.setLngLat(event.lngLat);
    if (!popup.isOpen()) popup.addTo(map);
  };

  const handleMouseLeave = (): void => {
    map.getCanvas().style.cursor = "";
    hoveredTile = null;
    popup.remove();
  };

  let installed = false;
  const install = (): void => {
    map.addSource(COVERAGE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    const firstSymbolId = map
      .getStyle()
      .layers?.find((layer) => layer.type === "symbol")?.id;
    // Les tuiles restent sous les libellés du fond de carte ; relief et routes
    // sont indispensables pour interpréter une mesure de couverture.
    map.addLayer(
      { ...COVERAGE_FILL_LAYER, layout: { visibility: "none" } },
      firstSymbolId,
    );
    map.addLayer(
      { ...COVERAGE_LINE_LAYER, layout: { visibility: "none" } },
      firstSymbolId,
    );
    map.on("mousemove", COVERAGE_FILL_ID, handleMouseMove);
    map.on("mouseleave", COVERAGE_FILL_ID, handleMouseLeave);
    installed = true;
    sync();
  };

  const destroy = (): void => {
    alive = false;
    popup.remove();
    if (installed) {
      map.off("mousemove", COVERAGE_FILL_ID, handleMouseMove);
      map.off("mouseleave", COVERAGE_FILL_ID, handleMouseLeave);
    }
  };

  return { install, sync, destroy };
}
