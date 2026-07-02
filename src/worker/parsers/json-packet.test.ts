import { describe, it, expect } from "vitest";
import { jsonMeshEdges, parseMessage } from "./json-packet";
import type { RawMeshtasticPacket } from "../../../types";

const CHANNELS = ["Fr_Balise", "Fr_EMCOM", "Fr_BlaBla"];

// Topic Meshtastic : msh/<region>/<gwnum>/json/<channel>/<gateway_id>
function topic(channel: string): string {
  return `msh/EU_868/2/json/${channel}/!aabbccdd`;
}

// Paquet brut minimal valide (émetteur connu, canal public).
function raw(overrides: Partial<RawMeshtasticPacket> = {}): RawMeshtasticPacket {
  return { from: 0xf669cf14, sender: "!aabbccdd", type: "position", ...overrides };
}

describe("parseMessage — barrière privacy (filtrage canal)", () => {
  it("ignore un canal absent de l'allowlist", () => {
    expect(parseMessage(topic("LongFast"), raw(), CHANNELS)).toBeNull();
  });

  it("accepte un canal de l'allowlist", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw(), CHANNELS);
    expect(parsed?.channel).toBe("Fr_Balise");
  });

  it("ignore un topic sans segment canal", () => {
    expect(parseMessage("msh/EU_868/2/json", raw(), CHANNELS)).toBeNull();
  });

  it("ignore tout quand l'allowlist est vide", () => {
    expect(parseMessage(topic("Fr_Balise"), raw(), [])).toBeNull();
  });

  it("filtre sur le NOM du canal (topic), pas sur l'index raw.channel", () => {
    // PKI/DM affichent channel=0 (= faux Fr_Balise) : on doit se fier au topic.
    const parsed = parseMessage(topic("Fr_EMCOM"), raw({ channel: 0 }), CHANNELS);
    expect(parsed?.channel).toBe("Fr_EMCOM");
  });
});

describe("parseMessage — émetteur", () => {
  it("ignore un paquet sans `from`", () => {
    expect(parseMessage(topic("Fr_Balise"), raw({ from: undefined }), CHANNELS)).toBeNull();
  });

  it("ignore un `from` non numérique", () => {
    const bad = { sender: "!x", from: "f669cf14" } as unknown as RawMeshtasticPacket;
    expect(parseMessage(topic("Fr_Balise"), bad, CHANNELS)).toBeNull();
  });
});

describe("parseMessage — NodeID (toNodeId)", () => {
  it("convertit un NodeNum en hex préfixé !", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw({ from: 0xf669cf14 }), CHANNELS);
    expect(parsed?.nodeId).toBe("!f669cf14");
  });

  it("pad sur 8 caractères pour les petits NodeNum", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw({ from: 0 }), CHANNELS);
    expect(parsed?.nodeId).toBe("!00000000");
  });

  it("interprète le NodeNum en non signé (bit de poids fort)", () => {
    // -1 (int32 signé) = 0xFFFFFFFF : sans `>>> 0` le hex serait cassé ("-1").
    const parsed = parseMessage(topic("Fr_Balise"), raw({ from: -1 }), CHANNELS);
    expect(parsed?.nodeId).toBe("!ffffffff");
  });
});

describe("parseMessage — payload position", () => {
  it("convertit lat/lon depuis les entiers *1e7", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ payload: { latitude_i: -210000000, longitude_i: 555000000, altitude: 12 } }),
      CHANNELS,
    );
    expect(parsed?.lat).toBe(-21);
    expect(parsed?.lon).toBe(55.5);
    expect(parsed?.altitude).toBe(12);
  });

  it("laisse lat/lon à null si absents", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw({ payload: {} }), CHANNELS);
    expect(parsed?.lat).toBeNull();
    expect(parsed?.lon).toBeNull();
  });
});

describe("parseMessage — métriques & métadonnées", () => {
  it("mappe rssi/snr/hops_away et la télémétrie", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ rssi: -90, snr: 5.5, hops_away: 2, payload: { battery_level: 80, voltage: 3.9 } }),
      CHANNELS,
    );
    expect(parsed?.rssi).toBe(-90);
    expect(parsed?.snr).toBe(5.5);
    expect(parsed?.hopCount).toBe(2);
    expect(parsed?.batteryPct).toBe(80);
    expect(parsed?.voltage).toBe(3.9);
    expect(parsed?.gatewayId).toBe("!aabbccdd");
  });

  it("met à null les champs numériques malformés", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ snr: "bruit" as unknown as number }),
      CHANNELS,
    );
    expect(parsed?.snr).toBeNull();
  });
});

describe("parseMessage — champs nodeinfo", () => {
  it("extrait longname/shortname et mappe hardware/role vers leur nom (type=nodeinfo)", () => {
    // Format réel du payload nodeinfo MQTT : longname/shortname, hardware & role
    // en NOMBRES (enums). hardware 110 = HELTEC_V4, role 0 = CLIENT.
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({
        type: "nodeinfo",
        payload: { longname: "Piton", shortname: "PIT", hardware: 110, role: 0 },
      }),
      CHANNELS,
    );
    expect(parsed?.longName).toBe("Piton");
    expect(parsed?.shortName).toBe("PIT");
    expect(parsed?.hwModel).toBe("HELTEC_V4");
    expect(parsed?.role).toBe("CLIENT");
  });

  it("packetType null si le type est absent", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw({ type: undefined }), CHANNELS);
    expect(parsed?.packetType).toBeNull();
  });

  it("ignore les champs nodeinfo si le type n'est pas nodeinfo", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ type: "position", payload: { longname: "Piton", hardware: 110 } }),
      CHANNELS,
    );
    expect(parsed?.longName).toBeNull();
    expect(parsed?.hwModel).toBeNull();
  });
});

describe("jsonMeshEdges — NeighborInfo", () => {
  it("crée une arête reporter -> voisin par voisin entendu", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "neighborinfo",
        payload: {
          neighbors: [
            { node_id: 0x11111111, snr: 6.5 },
            { node_id: 0x22222222, snr: -2 },
          ],
        },
      }),
      "Fr_Balise",
    );
    expect(edges).toHaveLength(2);
    const e = edges.find((x) => x.nodeId === "!11111111")!;
    expect(e.gatewayId).toBe("!f669cf14");
    expect(e.packetType).toBe("neighbor");
    expect(e.hopCount).toBe(0);
    expect(e.snr).toBeCloseTo(6.5);
    expect(e.edgeOnly).toBe(true);
  });

  it("ignore les voisins broadcast/soi-même", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "neighborinfo",
        payload: {
          neighbors: [
            { node_id: 0xffffffff, snr: 1 },
            { node_id: 0xf669cf14, snr: 1 },
            { node_id: 0x33333333, snr: 4 },
          ],
        },
      }),
      "Fr_Balise",
    );
    expect(edges.map((e) => e.nodeId)).toEqual(["!33333333"]);
  });

  it("renvoie [] pour un type non concerné", () => {
    expect(jsonMeshEdges(raw({ type: "position" }), "Fr_Balise")).toEqual([]);
  });

  it("renvoie [] si `from` n'est pas numérique", () => {
    expect(
      jsonMeshEdges({ type: "neighborinfo" } as RawMeshtasticPacket, "Fr_Balise"),
    ).toEqual([]);
  });

  it("renvoie [] si le reporter est invalide (NodeNum 0)", () => {
    const edges = jsonMeshEdges(
      raw({ from: 0, type: "neighborinfo", payload: { neighbors: [{ node_id: 1, snr: 1 }] } }),
      "Fr_Balise",
    );
    expect(edges).toEqual([]);
  });

  it("renvoie [] si `neighbors` n'est pas un tableau", () => {
    expect(jsonMeshEdges(raw({ type: "neighborinfo", payload: {} }), "Fr_Balise")).toEqual([]);
  });

  it("ignore un voisin sans node_id numérique", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "neighborinfo",
        payload: { neighbors: [{ snr: 5 }, { node_id: 0x44444444, snr: 3 }] },
      }),
      "Fr_Balise",
    );
    expect(edges.map((e) => e.nodeId)).toEqual(["!44444444"]);
  });
});

describe("jsonMeshEdges — Traceroute", () => {
  it("réponse (want_response=false) : relie les sauts aller aux extrémités, sans SNR", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "traceroute",
        to: 0x0a0a0a0a, // origine
        want_response: false,
        payload: { route: [0x0b0b0b0b] },
      } as Partial<RawMeshtasticPacket>),
      "Fr_Balise",
    );
    // aller = [origine, relay, dest=from] -> 2 sauts ; barème SNR JSON incertain -> null.
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.snr === null && e.hopCount === 0 && e.edgeOnly)).toBe(true);
    expect(edges.find((e) => e.nodeId === "!0a0a0a0a")?.gatewayId).toBe("!0b0b0b0b");
    expect(edges.find((e) => e.nodeId === "!0b0b0b0b")?.gatewayId).toBe("!f669cf14");
  });

  it("sens inconnu (pas de want_response) : relie seulement les relais consécutifs", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "traceroute",
        to: 0x0a0a0a0a,
        payload: { route: [0x0b0b0b0b, 0x0c0c0c0c] },
      }),
      "Fr_Balise",
    );
    // route = [B, C] -> uniquement B-C ; extrémités jamais reliées (sens ambigu).
    expect(edges).toHaveLength(1);
    expect(edges[0].nodeId).toBe("!0b0b0b0b");
    expect(edges[0].gatewayId).toBe("!0c0c0c0c");
    expect(
      edges.some((e) => e.gatewayId === "!f669cf14" || e.gatewayId === "!0a0a0a0a"),
    ).toBe(false);
  });

  it("ignore un nœud broadcast dans la route (saut non tracé)", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "traceroute",
        to: 0x0a0a0a0a,
        want_response: false,
        payload: { route: [0xffffffff] },
      } as Partial<RawMeshtasticPacket>),
      "Fr_Balise",
    );
    // aller = [origine, broadcast, dest] : les 2 sauts touchant broadcast sont ignorés.
    expect(edges).toEqual([]);
  });

  it("renvoie [] si `route` est absente", () => {
    expect(
      jsonMeshEdges(raw({ type: "traceroute", to: 0x0a0a0a0a, payload: {} }), "Fr_Balise"),
    ).toEqual([]);
  });

  it("réponse sans `to` : retombe sur `from` comme extrémité", () => {
    const edges = jsonMeshEdges(
      raw({
        type: "traceroute",
        want_response: false,
        payload: { route: [0x0b0b0b0b] },
      } as Partial<RawMeshtasticPacket>),
      "Fr_Balise",
    );
    // aller = [from, relay, from] : les 2 sauts relient from et le relais.
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.gatewayId).sort()).toEqual(["!0b0b0b0b", "!f669cf14"]);
  });
});
