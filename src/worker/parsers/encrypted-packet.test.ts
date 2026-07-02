import { describe, expect, it } from "vitest";
import protobuf from "protobufjs";
import type { ParsedPacket } from "../../../types";
import {
  encryptMeshtasticPayload,
  parseChannelKeys,
  parseEncryptedPacket,
} from "./encrypted-packet";

const CHANNELS = ["Fr_Balise"];
const TOPIC = "msh/EU_868/2/e/Fr_Balise/!f669cf14";
const KEY = "AQ==";

const PROTO = `
syntax = "proto3";
package meshtastic;

message ServiceEnvelope {
  MeshPacket packet = 1;
  string channel_id = 2;
  string gateway_id = 3;
}

message MeshPacket {
  fixed32 from = 1;
  fixed32 to = 2;
  uint32 channel = 3;
  Data decoded = 4;
  bytes encrypted = 5;
  fixed32 id = 6;
  fixed32 rx_time = 7;
  float rx_snr = 8;
  uint32 hop_limit = 9;
  int32 rx_rssi = 12;
  uint32 hop_start = 15;
}

message Data {
  uint32 portnum = 1;
  bytes payload = 2;
  bool want_response = 3;
}

message Position {
  sfixed32 latitude_i = 1;
  sfixed32 longitude_i = 2;
  int32 altitude = 3;
  uint32 precision_bits = 23;
}

message User {
  string long_name = 2;
  string short_name = 3;
  uint32 hw_model = 5;
  uint32 role = 7;
}

message DeviceMetrics {
  uint32 battery_level = 1;
  float voltage = 2;
  float channel_utilization = 3;
  float air_util_tx = 4;
}

message Telemetry {
  fixed32 time = 1;
  DeviceMetrics device_metrics = 2;
}

message NeighborInfo {
  uint32 node_id = 1;
  repeated Neighbor neighbors = 4;
}

message Neighbor {
  uint32 node_id = 1;
  float snr = 2;
}

message RouteDiscovery {
  repeated fixed32 route = 1;
  repeated int32 snr_towards = 2;
  repeated fixed32 route_back = 3;
  repeated int32 snr_back = 4;
}
`;

// Les portnums position/nodeinfo/telemetry renvoient une seule trame ; le type
// de retour est désormais une union (NeighborInfo/Traceroute renvoient un tableau).
// single() extrait la trame unique pour les tests mono-paquet.
function single(
  p: ParsedPacket | ParsedPacket[] | null,
): ParsedPacket | null {
  return Array.isArray(p) ? p[0] ?? null : p;
}

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const ServiceEnvelope = root.lookupType("meshtastic.ServiceEnvelope");
const Data = root.lookupType("meshtastic.Data");
const Position = root.lookupType("meshtastic.Position");
const User = root.lookupType("meshtastic.User");
const Telemetry = root.lookupType("meshtastic.Telemetry");
const NeighborInfo = root.lookupType("meshtastic.NeighborInfo");
const RouteDiscovery = root.lookupType("meshtastic.RouteDiscovery");

function envelope(
  portnum: number,
  payload: Uint8Array,
  opts: { to?: number; wantResponse?: boolean } = {},
): Uint8Array {
  const from = 0xf669cf14;
  const id = 123456;
  const data = Data.encode(
    Data.create({ portnum, payload, want_response: opts.wantResponse }),
  ).finish();
  const encrypted = encryptMeshtasticPayload(data, KEY, id, from);

  return ServiceEnvelope.encode(
    ServiceEnvelope.create({
      channel_id: "Fr_Balise",
      gateway_id: "!f669cf14",
      packet: {
        from,
        to: opts.to ?? 0xffffffff,
        channel: 0,
        encrypted,
        id,
        rx_time: 1782298809,
        rx_snr: -3.75,
        rx_rssi: -97,
        hop_start: 7,
        hop_limit: 7,
      },
    }),
  ).finish();
}

describe("parseEncryptedPacket", () => {
  it("décode un /e/ POSITION_APP chiffré", () => {
    const payload = Position.encode(
      Position.create({
        latitude_i: -213588710,
        longitude_i: 556632009,
        altitude: 289,
        precision_bits: 32,
      }),
    ).finish();

    const parsed = single(parseEncryptedPacket(
      TOPIC,
      envelope(3, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ));

    expect(parsed?.packetType).toBe("position");
    expect(parsed?.nodeId).toBe("!f669cf14");
    expect(parsed?.gatewayId).toBe("!f669cf14");
    expect(parsed?.channel).toBe("Fr_Balise");
    expect(parsed?.lat).toBeCloseTo(-21.358871);
    expect(parsed?.lon).toBeCloseTo(55.6632009);
    expect(parsed?.altitude).toBe(289);
    expect(parsed?.hopCount).toBe(0);
  });

  it("décode un /e/ NODEINFO_APP chiffré", () => {
    const payload = User.encode(
      User.create({
        long_name: "Piton",
        short_name: "PIT",
        hw_model: 110,
        role: 0,
      }),
    ).finish();

    const parsed = single(parseEncryptedPacket(
      TOPIC,
      envelope(4, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ));

    expect(parsed?.packetType).toBe("nodeinfo");
    expect(parsed?.longName).toBe("Piton");
    expect(parsed?.shortName).toBe("PIT");
    expect(parsed?.hwModel).toBe("HELTEC_V4");
    expect(parsed?.role).toBe("CLIENT");
  });

  it("décode un /e/ TELEMETRY_APP chiffré", () => {
    const payload = Telemetry.encode(
      Telemetry.create({
        device_metrics: {
          battery_level: 82,
          voltage: 3.91,
          channel_utilization: 12.5,
          air_util_tx: 1.2,
        },
      }),
    ).finish();

    const parsed = single(parseEncryptedPacket(
      TOPIC,
      envelope(67, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ));

    expect(parsed?.packetType).toBe("telemetry");
    expect(parsed?.batteryPct).toBe(82);
    expect(parsed?.voltage).toBeCloseTo(3.91);
    expect(parsed?.channelUtil).toBeCloseTo(12.5);
    expect(parsed?.airUtilTx).toBeCloseTo(1.2);
  });

  it("ignore les canaux sans clé connue", () => {
    const payload = Position.encode(Position.create({ latitude_i: 1 })).finish();

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(3, payload),
      CHANNELS,
      parseChannelKeys("Autre:AQ=="),
    );

    expect(parsed).toBeNull();
  });

  it("log un fixture base64 quand un paquet chiffré ne se décode pas", () => {
    const raw = ServiceEnvelope.encode(
      ServiceEnvelope.create({
        channel_id: "Fr_Balise",
        gateway_id: "!f669cf14",
        packet: {
          from: 0xf669cf14,
          to: 0xffffffff,
          encrypted: Buffer.from("not-a-valid-data-packet"),
          id: 123456,
        },
      }),
    ).finish();
    const logs: string[] = [];

    const parsed = parseEncryptedPacket(
      TOPIC,
      raw,
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
      (message) => logs.push(message),
    );

    expect(parsed).toBeNull();
    expect(logs).toContainEqual(
      expect.stringContaining(`packet_b64=${Buffer.from(raw).toString("base64")}`),
    );
  });

  it("décode un paquet réel chiffré avec la PSK courte Meshtastic AQ==", () => {
    const raw = Buffer.from(
      "CnwNFM9p9hX/////GFkqW1p/+JZwDcDlVuLHaWu717VtGPQuf02L29ecUMRWCu2hIGvD+V46gTCu+hdhlb+f4U5n1i/bwJLoPK8YSTtWbtx/2yu1paaKdmYJL7bqJOMDAwzIlDr9dtGm4iw12CVX2D2uzTtqSANYCngDmAEUEglGcl9CYWxpc2UaCSFmNjY5Y2YxNA==",
      "base64",
    );

    const parsed = single(parseEncryptedPacket(
      TOPIC,
      raw,
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ));

    expect(parsed?.packetType).toBe("nodeinfo");
    expect(parsed?.nodeId).toBe("!f669cf14");
    expect(parsed?.longName).toBe("974SJOSLM8ClP_P137");
    expect(parsed?.shortName).toBe("Rob1");
  });

  it("décode un /e/ NEIGHBORINFO_APP en arêtes 'reporter a entendu voisin'", () => {
    const payload = NeighborInfo.encode(
      NeighborInfo.create({
        node_id: 0xf669cf14,
        neighbors: [
          { node_id: 0x11111111, snr: 6.5 },
          { node_id: 0x22222222, snr: -2 },
        ],
      }),
    ).finish();

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(71, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ) as ParsedPacket[];

    expect(Array.isArray(parsed)).toBe(true);
    // Trame de base : le gateway a bien entendu le reporter (upsert node normal).
    const base = parsed[0];
    expect(base.packetType).toBe("neighborinfo");
    expect(base.nodeId).toBe("!f669cf14");
    expect(base.edgeOnly).toBeFalsy();

    // Arêtes : reporter (gateway) -> chaque voisin (node), lien radio direct.
    const edges = parsed.slice(1);
    expect(edges).toHaveLength(2);
    const e1 = edges.find((e) => e.nodeId === "!11111111")!;
    expect(e1.gatewayId).toBe("!f669cf14");
    expect(e1.packetType).toBe("neighbor");
    expect(e1.hopCount).toBe(0);
    expect(e1.snr).toBeCloseTo(6.5);
    expect(e1.edgeOnly).toBe(true);
  });

  it("ignore les voisins broadcast/soi-même dans NeighborInfo", () => {
    const payload = NeighborInfo.encode(
      NeighborInfo.create({
        node_id: 0xf669cf14,
        neighbors: [
          { node_id: 0xffffffff, snr: 1 }, // broadcast -> ignoré
          { node_id: 0xf669cf14, snr: 1 }, // soi-même -> ignoré
          { node_id: 0x33333333, snr: 4 },
        ],
      }),
    ).finish();

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(71, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ) as ParsedPacket[];

    const edges = parsed.slice(1);
    expect(edges).toHaveLength(1);
    expect(edges[0].nodeId).toBe("!33333333");
  });

  it("décode un /e/ TRACEROUTE_APP (réponse) en sauts radio directs", () => {
    const origin = 0x0a0a0a0a;
    const relay = 0x0b0b0b0b;
    const payload = RouteDiscovery.encode(
      RouteDiscovery.create({
        route: [relay],
        snr_towards: [24, 12], // int8 ×4 -> 6 dB puis 3 dB
      }),
    ).finish();

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(70, payload, { to: origin, wantResponse: false }),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ) as ParsedPacket[];

    expect(parsed[0].packetType).toBe("traceroute");
    expect(parsed[0].nodeId).toBe("!f669cf14");

    // Aller = [origin, relay, dest=from] -> 2 sauts ; route_back vide -> pas de retour.
    const edges = parsed.slice(1);
    expect(edges).toHaveLength(2);
    const hop0 = edges.find((e) => e.nodeId === "!0a0a0a0a")!; // origin entendu par relay
    expect(hop0.gatewayId).toBe("!0b0b0b0b");
    expect(hop0.hopCount).toBe(0);
    expect(hop0.snr).toBeCloseTo(6);
    expect(hop0.edgeOnly).toBe(true);
    const hop1 = edges.find((e) => e.nodeId === "!0b0b0b0b")!; // relay entendu par dest
    expect(hop1.gatewayId).toBe("!f669cf14");
    expect(hop1.snr).toBeCloseTo(3);
  });

  it("traceroute (requête en vol) n'invente pas de lien vers la destination", () => {
    const dest = 0x0c0c0c0c;
    const relay = 0x0b0b0b0b;
    const payload = RouteDiscovery.encode(
      RouteDiscovery.create({ route: [relay], snr_towards: [20] }),
    ).finish();

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(70, payload, { to: dest, wantResponse: true }),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ) as ParsedPacket[];

    // Aller = [from, relay] : la destination n'est pas encore atteinte.
    const edges = parsed.slice(1);
    expect(edges).toHaveLength(1);
    expect(edges[0].nodeId).toBe("!f669cf14"); // from entendu par relay
    expect(edges[0].gatewayId).toBe("!0b0b0b0b");
    expect(edges[0].snr).toBeCloseTo(5);
    expect(
      edges.some((e) => e.nodeId === "!0c0c0c0c" || e.gatewayId === "!0c0c0c0c"),
    ).toBe(false);
  });

  it("traceroute ignore les SNR inconnus (INT8_MIN)", () => {
    const origin = 0x0a0a0a0a;
    const payload = RouteDiscovery.encode(
      RouteDiscovery.create({ route: [], snr_towards: [-128] }),
    ).finish();

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(70, payload, { to: origin, wantResponse: false }),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    ) as ParsedPacket[];

    // Aller = [origin, dest=from] -> 1 saut direct, SNR inconnu.
    const edges = parsed.slice(1);
    expect(edges).toHaveLength(1);
    expect(edges[0].snr).toBeNull();
  });
});
