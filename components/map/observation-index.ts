// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Observation } from "@/types";
import type { HoverEdge } from "./hover-edges";
import type { LngLat } from "./map-data";
import { haversineKm } from "@/lib/geo";

export type ObservationIndex = {
  minHopByNode: Map<string, number>;
  heardByNode: Map<string, Set<string>>;
  hoverByNode: Map<string, HoverEdge[]>;
};

const addHoverEdge = (
  index: Map<string, HoverEdge[]>,
  nodeId: string,
  edge: HoverEdge,
): void => {
  const edges = index.get(nodeId) ?? [];
  edges.push(edge);
  index.set(nodeId, edges);
};

// Transforme la réponse API en index directement consommables par la carte.
// Les liens déclarés NeighborInfo/traceroute servent uniquement au survol :
// le filtre par hops et l'anneau « pont » restent fondés sur les réceptions
// réelles des gateways.
export function indexObservations(observations: Observation[]): ObservationIndex {
  const minHopByNode = new Map<string, number>();
  const heardByNode = new Map<string, Set<string>>();
  const hoverByNode = new Map<string, HoverEdge[]>();

  for (const observation of observations) {
    const hop = observation.bestHop ?? 9;
    if (
      observation.source === "neighbor" ||
      observation.source === "traceroute"
    ) {
      addHoverEdge(hoverByNode, observation.gatewayId, {
        nodeId: observation.nodeId,
        hop: 0,
        packets: 0,
        source: observation.source,
      });
      addHoverEdge(hoverByNode, observation.nodeId, {
        nodeId: observation.gatewayId,
        hop: 0,
        packets: 0,
        source: observation.source,
      });
      continue;
    }

    const previousHop = minHopByNode.get(observation.nodeId);
    if (previousHop === undefined || hop < previousHop) {
      minHopByNode.set(observation.nodeId, hop);
    }

    const gateways = heardByNode.get(observation.nodeId) ?? new Set<string>();
    gateways.add(observation.gatewayId);
    heardByNode.set(observation.nodeId, gateways);

    addHoverEdge(hoverByNode, observation.gatewayId, {
      nodeId: observation.nodeId,
      hop,
      packets: observation.packets,
      source: "gateway",
    });
    addHoverEdge(hoverByNode, observation.nodeId, {
      nodeId: observation.gatewayId,
      hop,
      packets: observation.packets,
      source: "gateway",
    });
  }

  return { minHopByNode, heardByNode, hoverByNode };
}

// Un node reçoit l'anneau « pont » s'il est entendu par au moins deux gateways
// géographiquement plausibles. La limite est partagée avec les liens dessinés.
export function bridgeNodeIds(
  heardByNode: Map<string, Set<string>>,
  positionOf: (nodeId: string) => LngLat | null,
  maxDistanceKm: number,
): Set<string> {
  const bridges = new Set<string>();

  for (const [nodeId, gatewayIds] of heardByNode) {
    const nodePosition = positionOf(nodeId);
    if (!nodePosition) continue;

    let nearbyGateways = 0;
    for (const gatewayId of gatewayIds) {
      if (gatewayId === nodeId) continue;
      const gatewayPosition = positionOf(gatewayId);
      if (!gatewayPosition) continue;
      if (
        haversineKm(
          nodePosition[1],
          nodePosition[0],
          gatewayPosition[1],
          gatewayPosition[0],
        ) <= maxDistanceKm
      ) {
        nearbyGateways++;
      }
    }
    if (nearbyGateways >= 2) bridges.add(nodeId);
  }

  return bridges;
}
