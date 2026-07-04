import type { TracerouteHop } from "../../types";

export const SUBJECT_COLOR = "#2563eb";
export const TRACE_NODE_COLOR = "#7c3aed";

export type SubjectNode = {
  nodeId: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
};

export type MapNode = {
  nodeId: string;
  name: string | null;
  snr: number | null;
  lat: number | null;
  lon: number | null;
};

export type VisualNodeAnchors = Record<string, [number, number]>;

export const shortId = (id: string): string => id.replace(/^!/, "").slice(-4);

export const nodeLabel = (id: string, name: string | null): string =>
  name?.trim() || shortId(id);

export const fmtSnr = (s: number | null): string =>
  s == null ? "— dB" : `${s} dB`;

export const traceDirectionLabel = (direction: "forward" | "back"): string =>
  direction === "back" ? "↙ Retour" : "↗ Aller";

export const locatedNeighbors = (links: MapNode[]): MapNode[] =>
  links.filter((n) => n.lat != null && n.lon != null);

export function splitHops(hops: TracerouteHop[]): {
  forward: TracerouteHop[];
  back: TracerouteHop[];
} {
  return {
    forward: hops.filter((h) => h.direction === "forward"),
    back: hops.filter((h) => h.direction === "back"),
  };
}
