import { describe, it, expect } from "vitest";
import { toObservations } from "./observations";

// Arêtes "qui a entendu qui". pg renvoie MIN(hop_count) en number ou string ;
// snr (AVG::real) en number. bestHop = 0 → lien radio direct.
describe("toObservations — arêtes gateway × node", () => {
  it("coerce bestHop/packets en number et garde snr", () => {
    expect(
      toObservations([
        { gatewayId: "!gw", nodeId: "!n1", bestHop: "0", snr: 5.5, packets: "42" },
      ]),
    ).toEqual([
      {
        gatewayId: "!gw",
        nodeId: "!n1",
        bestHop: 0,
        snr: 5.5,
        packets: 42,
        source: "gateway",
      },
    ]);
  });

  it("garde bestHop null si inconnu (hop_count absent)", () => {
    const obs = toObservations([
      { gatewayId: "!gw", nodeId: "!n1", bestHop: null, snr: null, packets: 3 },
    ]);
    expect(obs[0].bestHop).toBeNull();
    expect(obs[0].snr).toBeNull();
    expect(obs[0].packets).toBe(3);
  });

  it("propage source neighbor/traceroute, défaut gateway sinon", () => {
    const obs = toObservations([
      { gatewayId: "!a", nodeId: "!b", bestHop: 0, snr: 3, packets: 0, source: "neighbor" },
      { gatewayId: "!a", nodeId: "!c", bestHop: 0, snr: null, packets: 0, source: "traceroute" },
      { gatewayId: "!gw", nodeId: "!d", bestHop: 1, snr: 2, packets: 7, source: "inconnu" },
      { gatewayId: "!gw", nodeId: "!e", bestHop: 0, snr: 1, packets: 9 },
    ]);
    expect(obs.map((o) => o.source)).toEqual([
      "neighbor",
      "traceroute",
      "gateway",
      "gateway",
    ]);
  });
});
