import { describe, expect, it } from "vitest";
import type { Observation } from "@/types";
import {
  bridgeNodeIds,
  indexGatewayActivity,
  indexObservations,
} from "./observation-index";
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

  it("traite un hop inconnu comme lointain plutôt que comme direct", () => {
    // bestHop null (hop_count absent du paquet) ne doit surtout pas devenir 0 :
    // un lien serait alors annoncé « direct » sans preuve. Le repli à 9 le
    // range hors de tous les filtres de proximité.
    const index = indexObservations([observation({ bestHop: null })]);
    expect(index.minHopByNode.get("!node")).toBe(9);
  });

  it("conserve le hop minimal et toutes les gateways entendues", () => {
    const index = indexObservations([
      observation({ gatewayId: "!gw1", bestHop: 2 }),
      observation({ gatewayId: "!gw2", bestHop: 1 }),
      // Hop plus GRAND que le minimum déjà retenu : ne doit pas l'écraser.
      observation({ gatewayId: "!gw3", bestHop: 3 }),
    ]);

    expect(index.minHopByNode.get("!node")).toBe(1);
    expect(index.heardByNode.get("!node")).toEqual(
      new Set(["!gw1", "!gw2", "!gw3"]),
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

  it("ignore un node dont la position est inconnue", () => {
    // Sans position, la distance n'est pas calculable : l'anneau ne peut pas
    // être décidé, et l'inventer serait pire que de s'abstenir.
    expect(
      bridgeNodeIds(
        new Map([["!inconnu", new Set(["!gw1", "!gw2"])]]),
        () => null,
        20,
      ),
    ).toEqual(new Set());
  });

  it("ignore les gateways sans position et le node lui-même", () => {
    // Un node qui est sa propre gateway ne se « ponte » pas tout seul, et une
    // gateway non localisée ne peut pas compter dans le seuil de distance.
    const positions = new Map<string, LngLat>([
      ["!node", [55.5, -21.1]],
      ["!near", [55.51, -21.1]],
    ]);
    const positionOf = (id: string): LngLat | null =>
      positions.get(id) ?? null;

    expect(
      bridgeNodeIds(
        new Map([["!node", new Set(["!node", "!near", "!sansPosition"])]]),
        positionOf,
        20,
      ),
    ).toEqual(new Set());
  });
});

describe("indexGatewayActivity", () => {
  it("indexe les compteurs par passerelle", () => {
    const counts = indexGatewayActivity([
      { gatewayId: "!gw1", directNodes1h: 7 },
      { gatewayId: "!gw2", directNodes1h: 0 },
    ]);
    expect(counts.get("!gw1")).toBe(7);
    expect(counts.get("!gw2")).toBe(0);
  });

  it("laisse absente une passerelle sans ligne", () => {
    expect(indexGatewayActivity([]).has("!gw")).toBe(false);
  });
});
