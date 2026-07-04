import { describe, it, expect } from "vitest";
import { parseMessage } from "./json-packet";
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

describe("parseMessage — filtrage texte", () => {
  it("drop un message text sans /URGENT", () => {
    expect(
      parseMessage(topic("Fr_Balise"), raw({ type: "text", payload: "message banal" }), CHANNELS),
    ).toBeNull();
  });

  it("laisse passer un message text contenant /URGENT", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ type: "text", payload: "test /URGENT besoin radio" }),
      CHANNELS,
    );

    expect(parsed?.packetType).toBe("text");
    expect(parsed?.raw.payload).toBe("test /URGENT besoin radio");
  });

  it("ne filtre pas les autres types, même si le payload est du texte", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ type: "rangetest", payload: "message banal" }),
      CHANNELS,
    );

    expect(parsed?.packetType).toBe("rangetest");
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

describe("parseMessage — NeighborInfo", () => {
  it("attache les voisins directs (exclut broadcast / soi-même)", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({
        type: "neighborinfo",
        payload: {
          neighbors: [
            { node_id: 0xffffffff, snr: 1 }, // broadcast -> ignoré
            { node_id: 0xf669cf14, snr: 1 }, // soi-même -> ignoré
            { node_id: 0x33333333, snr: 4 },
          ],
        },
      }),
      CHANNELS,
    );
    expect(parsed?.neighbors).toEqual([{ neighborId: "!33333333", snr: 4 }]);
  });

  it("neighbors undefined sur les autres types", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw({ type: "position" }), CHANNELS);
    expect(parsed?.neighbors).toBeUndefined();
  });

  it("payload sans tableau neighbors -> liste vide", () => {
    const parsed = parseMessage(topic("Fr_Balise"), raw({ type: "neighborinfo", payload: {} }), CHANNELS);
    expect(parsed?.neighbors).toEqual([]);
  });
});

describe("parseMessage — Traceroute", () => {
  it("réponse (want_response=false) : segments aller, SNR null (barème JSON non fiable)", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({
        type: "traceroute",
        to: 0x0a0a0a0a,
        want_response: false,
        payload: { route: [0x0b0b0b0b] },
      } as Partial<RawMeshtasticPacket>),
      CHANNELS,
    );
    const t = parsed?.traceroute;
    expect(t?.sourceNode).toBe("!0a0a0a0a");
    expect(t?.targetNode).toBe("!f669cf14");
    const fwd = (t?.segments ?? []).filter((s) => s.direction === "forward");
    expect(fwd.map((s) => [s.fromNode, s.toNode, s.snr])).toEqual([
      ["!0a0a0a0a", "!0b0b0b0b", null],
      ["!0b0b0b0b", "!f669cf14", null],
    ]);
  });

  it("sens indéterminé (pas de want_response) -> pas de traceroute", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ type: "traceroute", to: 0x0a0a0a0a, payload: { route: [0x0b0b0b0b] } }),
      CHANNELS,
    );
    expect(parsed?.traceroute).toBeUndefined();
  });
});
