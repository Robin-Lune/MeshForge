import { describe, expect, it } from "vitest";
import protobuf from "protobufjs";
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
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const ServiceEnvelope = root.lookupType("meshtastic.ServiceEnvelope");
const Data = root.lookupType("meshtastic.Data");
const Position = root.lookupType("meshtastic.Position");
const User = root.lookupType("meshtastic.User");
const Telemetry = root.lookupType("meshtastic.Telemetry");

function envelope(portnum: number, payload: Uint8Array): Uint8Array {
  const from = 0xf669cf14;
  const id = 123456;
  const data = Data.encode(Data.create({ portnum, payload })).finish();
  const encrypted = encryptMeshtasticPayload(data, KEY, id, from);

  return ServiceEnvelope.encode(
    ServiceEnvelope.create({
      channel_id: "Fr_Balise",
      gateway_id: "!f669cf14",
      packet: {
        from,
        to: 0xffffffff,
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

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(3, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    );

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

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(4, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    );

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

    const parsed = parseEncryptedPacket(
      TOPIC,
      envelope(67, payload),
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    );

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

    const parsed = parseEncryptedPacket(
      TOPIC,
      raw,
      CHANNELS,
      parseChannelKeys("Fr_Balise:AQ=="),
    );

    expect(parsed?.packetType).toBe("nodeinfo");
    expect(parsed?.nodeId).toBe("!f669cf14");
    expect(parsed?.longName).toBe("974SJOSLM8ClP_P137");
    expect(parsed?.shortName).toBe("Rob1");
  });
});
