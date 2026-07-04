import type { NodeTraceroute, TracerouteHop } from "../../types";
import { signalColor } from "../map/signal-color";
import {
  SUBJECT_COLOR,
  TRACE_NODE_COLOR,
  nodeLabel,
  type MapNode,
  type SubjectNode,
  type VisualNodeAnchors,
} from "./format";

export function buildLinkFeatures(
  node: SubjectNode,
  located: MapNode[],
  hoveredId: string | null,
  trace: NodeTraceroute | null = null,
  visualAnchors: VisualNodeAnchors = {},
): GeoJSON.FeatureCollection {
  const traced = traceHopsWithPosition(trace);
  const subjectCoords = visualNodeCoordinates(
    node.nodeId,
    [node.lon as number, node.lat as number],
    visualAnchors,
  );
  const directLinks = located
    .filter((n) => !(trace && hoveredId === n.nodeId))
    .map((n) => ({
      type: "Feature" as const,
      properties: {
        color: signalColor(n.snr),
        dim: hoveredId != null && hoveredId !== n.nodeId,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          subjectCoords,
          visualNodeCoordinates(
            n.nodeId,
            [n.lon as number, n.lat as number],
            visualAnchors,
          ),
        ],
      },
    }));
  const traceLinks = traced.map((h) => ({
    type: "Feature" as const,
    properties: {
      color: signalColor(h.snr),
      dim: false,
    },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        visualNodeCoordinates(
          h.fromNode,
          [h.fromLon as number, h.fromLat as number],
          visualAnchors,
        ),
        visualNodeCoordinates(
          h.toNode,
          [h.toLon as number, h.toLat as number],
          visualAnchors,
        ),
      ],
    },
  }));
  return {
    type: "FeatureCollection",
    features: [...directLinks, ...traceLinks],
  };
}

export function buildNodeFeatures(
  node: SubjectNode,
  located: MapNode[],
  trace: NodeTraceroute | null = null,
): GeoJSON.FeatureCollection {
  const seen = new Set([node.nodeId, ...located.map((n) => n.nodeId)]);
  const traceNodes: GeoJSON.Feature[] = [];
  for (const h of traceHopsWithPosition(trace)) {
    for (const end of [
      { nodeId: h.fromNode, name: h.fromName, lat: h.fromLat, lon: h.fromLon },
      { nodeId: h.toNode, name: h.toName, lat: h.toLat, lon: h.toLon },
    ]) {
      if (seen.has(end.nodeId)) continue;
      seen.add(end.nodeId);
      traceNodes.push({
        type: "Feature",
        properties: {
          kind: "trace",
          nodeId: end.nodeId,
          label: nodeLabel(end.nodeId, end.name),
          color: TRACE_NODE_COLOR,
        },
        geometry: {
          type: "Point",
          coordinates: [end.lon as number, end.lat as number],
        },
      });
    }
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          kind: "subject",
          nodeId: node.nodeId,
          label: nodeLabel(node.nodeId, node.name),
          color: SUBJECT_COLOR,
        },
        geometry: {
          type: "Point",
          coordinates: [node.lon as number, node.lat as number],
        },
      },
      ...located.map((n) => ({
        type: "Feature" as const,
        properties: {
          kind: "neighbor",
          nodeId: n.nodeId,
          label: nodeLabel(n.nodeId, n.name),
          color: signalColor(n.snr),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [n.lon as number, n.lat as number],
        },
      })),
      ...traceNodes,
    ],
  };
}

export function traceHopsWithPosition(
  trace: NodeTraceroute | null,
): TracerouteHop[] {
  return (trace?.hops ?? []).filter(
    (h) =>
      h.fromLat != null &&
      h.fromLon != null &&
      h.toLat != null &&
      h.toLon != null,
  );
}

export function visualNodeCoordinates(
  nodeId: string,
  fallback: [number, number],
  visualAnchors: VisualNodeAnchors,
): [number, number] {
  return visualAnchors[nodeId] ?? fallback;
}
