import { describe, it, expect } from "vitest";
import { parseMqttPacket } from "./index";

const CHANNELS = ["Fr_Balise"];
const JSON_TOPIC = "msh/EU_868/2/json/Fr_Balise/!aabbccdd";

function buf(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj));
}

// parseMqttPacket : aiguillage par topic + normalisation en tableau (1 message
// -> 0, 1 ou N trames). NeighborInfo/Traceroute produisent base + arêtes.
describe("parseMqttPacket", () => {
  it("renvoie [] pour un topic non géré", () => {
    expect(parseMqttPacket("msh/EU_868/2/other/x", Buffer.from(""), CHANNELS)).toEqual([]);
  });

  it("JSON simple -> une seule trame (résultat unique enveloppé en tableau)", () => {
    const out = parseMqttPacket(
      JSON_TOPIC,
      buf({ from: 1, sender: "!aabbccdd", type: "position" }),
      CHANNELS,
    );
    expect(out).toHaveLength(1);
    expect(out[0].packetType).toBe("position");
  });

  it("JSON sur canal privé -> []", () => {
    const out = parseMqttPacket(
      "msh/EU_868/2/json/Secret/!aabbccdd",
      buf({ from: 1, sender: "!aabbccdd", type: "position" }),
      CHANNELS,
    );
    expect(out).toEqual([]);
  });

  it("JSON NeighborInfo -> trame de base + arête(s)", () => {
    const out = parseMqttPacket(
      JSON_TOPIC,
      buf({
        from: 0xf669cf14,
        sender: "!aabbccdd",
        type: "neighborinfo",
        payload: { neighbors: [{ node_id: 0x11111111, snr: 5 }] },
      }),
      CHANNELS,
    );
    expect(out).toHaveLength(2);
    expect(out[0].packetType).toBe("neighborinfo");
    expect(out[0].edgeOnly).toBeFalsy();
    expect(out[1].packetType).toBe("neighbor");
    expect(out[1].edgeOnly).toBe(true);
  });

  it("branche /map/ : report invalide -> []", () => {
    expect(
      parseMqttPacket("msh/EU_868/2/map/Fr_Balise/!gw", Buffer.alloc(0), CHANNELS),
    ).toEqual([]);
  });

  it("branche /e/ : envelope indécodable -> []", () => {
    expect(
      parseMqttPacket("msh/EU_868/2/e/Fr_Balise/!gw", Buffer.alloc(0), CHANNELS),
    ).toEqual([]);
  });
});
