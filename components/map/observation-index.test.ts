import { describe, expect, it } from "vitest";
import type { Observation } from "@/types";
import { bridgeNodeIds, indexObservations } from "./observation-index";
import type { LngLat } from "./map-data";

const observation = (
  over: Partial<Observation> = {},
): Observation => ({
  gatewayId: "!gateway",
  nodeId: "!node",
  bestHop: 0,
  snr: -8,
  packets: 4,
  source: "gateway",
  ...over,
});

describe("indexObservations", () => {
  it("indexe une réception gateway dans les deux sens pour le survol", () => {
    const index = indexObservations([observation()]);

    expect(index.minHopByNode.get("!node")).toBe(0);
    expect(index.heardByNode.get("!node")).toEqual(new Set(["!gateway"]));
    expect(index.hoverByNode.get("!gateway")?.[0]).toMatchObject({
      nodeId: "!node",
      source: "gateway",
    });
    expect(index.hoverByNode.get("!node")?.[0]).toMatchObject({
      nodeId: "!gateway",
      source: "gateway",
    });
  });

  it("conserve le hop minimal et toutes les gateways entendues", () => {
    const index = indexObservations([
      observation({ gatewayId: "!gw1", bestHop: 2 }),
      observation({ gatewayId: "!gw2", bestHop: 1 }),
    ]);

    expect(index.minHopByNode.get("!node")).toBe(1);
    expect(index.heardByNode.get("!node")).toEqual(
      new Set(["!gw1", "!gw2"]),
    );
  });

  it("réserve NeighborInfo et traceroute au survol", () => {
    const index = indexObservations([
      observation({
        gatewayId: "!a",
        nodeId: "!b",
        source: "neighbor",
      }),
      observation({
        gatewayId: "!b",
        nodeId: "!c",
        source: "traceroute",
      }),
    ]);

    expect(index.minHopByNode).toHaveLength(0);
    expect(index.heardByNode).toHaveLength(0);
    expect(index.hoverByNode.get("!a")?.[0]).toMatchObject({
      nodeId: "!b",
      hop: 0,
      packets: 0,
      source: "neighbor",
    });
    expect(index.hoverByNode.get("!c")?.[0]).toMatchObject({
      nodeId: "!b",
      source: "traceroute",
    });
  });
});

describe("bridgeNodeIds", () => {
  it("exige deux gateways positionnées à portée", () => {
    const positions = new Map<string, LngLat>([
      ["!node", [55.5, -21.1]],
      ["!near1", [55.51, -21.1]],
      ["!near2", [55.49, -21.1]],
      ["!far", [56.2, -21.1]],
    ]);
    const positionOf = (id: string): LngLat | null =>
      positions.get(id) ?? null;

    expect(
      bridgeNodeIds(
        new Map([["!node", new Set(["!near1", "!near2", "!far"])]]),
        positionOf,
        20,
      ),
    ).toEqual(new Set(["!node"]));

    expect(
      bridgeNodeIds(
        new Map([["!node", new Set(["!near1", "!far"])]]),
        positionOf,
        20,
      ),
    ).toEqual(new Set());
  });
});
