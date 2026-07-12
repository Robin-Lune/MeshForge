import { describe, expect, it } from "vitest";
import { bestTargets } from "./hover-edges";
import type { HoverEdge } from "./hover-edges";

const edge = (over: Partial<HoverEdge>): HoverEdge => ({
  nodeId: "!n1",
  hop: 0,
  packets: 0,
  source: "gateway",
  ...over,
});

describe("bestTargets — une arête par cible au survol", () => {
  it("laisse passer des cibles distinctes sans les fusionner", () => {
    const out = bestTargets([
      edge({ nodeId: "!a", source: "neighbor" }),
      edge({ nodeId: "!b", source: "traceroute" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("à source égale : hop minimal et packets maximal (bidirectionnel)", () => {
    const out = bestTargets([
      edge({ hop: 2, packets: 5 }),
      edge({ hop: 0, packets: 3 }),
    ]);
    expect(out).toEqual([edge({ hop: 0, packets: 5 })]);
  });

  it("gateway prime sur traceroute et neighbor (pas de superposition)", () => {
    const out = bestTargets([
      edge({ source: "neighbor" }),
      edge({ source: "gateway", hop: 1, packets: 4 }),
      edge({ source: "traceroute" }),
    ]);
    expect(out).toEqual([edge({ source: "gateway", hop: 1, packets: 4 })]);
  });

  it("traceroute prime sur neighbor", () => {
    const out = bestTargets([
      edge({ source: "neighbor" }),
      edge({ source: "traceroute" }),
    ]);
    expect(out).toEqual([edge({ source: "traceroute" })]);
  });

  it("une source prioritaire déjà retenue n'est pas dégradée ni re-fusionnée", () => {
    const out = bestTargets([
      edge({ source: "gateway", hop: 1, packets: 4 }),
      edge({ source: "neighbor", hop: 0, packets: 9 }),
    ]);
    expect(out).toEqual([edge({ source: "gateway", hop: 1, packets: 4 })]);
  });

  it("ne mute pas les arêtes d'entrée", () => {
    const a = edge({ hop: 2, packets: 5 });
    bestTargets([a, edge({ hop: 0, packets: 3 })]);
    expect(a).toEqual(edge({ hop: 2, packets: 5 }));
  });
});
