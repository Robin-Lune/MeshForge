import type { PublicNode } from "@/types";

export type LngLat = [number, number];

export type MarkerNode = Pick<
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

export function shortLabel(
  nodeId: string,
  shortName: string | null | undefined,
): string {
  const s = shortName?.trim();
  return s && s.length > 0 ? s : nodeId.replace(/^!/, "").slice(-4);
}

export function nodeFeature(n: MarkerNode): GeoJSON.Feature {
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
      // Défaut PRUDENT, aligné sur is_mobile BOOLEAN DEFAULT TRUE : NodeUpdate
      // ne transporte pas ce champ, et un `?? false` ferait annoncer « position
      // exacte » pour un node dont le serveur a floué la position.
      isMobile: n.isMobile ?? true,
      // Pas de `color` : elle dépend du temps écoulé, pas de la donnée. Elle est
      // calculée au rendu et repeinte par applyFreshness().
    },
  };
}

export const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

export function lineFeature(from: LngLat, to: LngLat, hop: number): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: { hop },
    geometry: { type: "LineString", coordinates: [from, to] },
  };
}
