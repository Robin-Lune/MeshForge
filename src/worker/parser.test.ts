import { describe, it, expect } from "vitest";
import { parseMessage } from "./parser";
import type { RawMeshtasticPacket } from "../../types";

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
  it("renseigne long_name/short_name uniquement sur type=nodeinfo", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ type: "nodeinfo", payload: { long_name: "Piton", short_name: "PIT", hw_model: "HELTEC_V3" } }),
      CHANNELS,
    );
    expect(parsed?.longName).toBe("Piton");
    expect(parsed?.shortName).toBe("PIT");
    expect(parsed?.hwModel).toBe("HELTEC_V3");
  });

  it("ignore long_name si le type n'est pas nodeinfo", () => {
    const parsed = parseMessage(
      topic("Fr_Balise"),
      raw({ type: "position", payload: { long_name: "Piton" } }),
      CHANNELS,
    );
    expect(parsed?.longName).toBeNull();
  });
});
