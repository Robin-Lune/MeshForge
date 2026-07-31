import { createDecipheriv } from "crypto";
import protobuf from "protobufjs";
import { describe, expect, it } from "vitest";
import { buildMqttAnnouncement } from "./mqtt-announcement";

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
  bytes encrypted = 5;
  fixed32 id = 6;
  uint32 hop_limit = 9;
  bool via_mqtt = 14;
  uint32 hop_start = 15;
}

message Data {
  uint32 portnum = 1;
  bytes payload = 2;
}
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const ServiceEnvelope = root.lookupType("meshtastic.ServiceEnvelope");
const Data = root.lookupType("meshtastic.Data");
const key = Buffer.alloc(16, 0x2a);
const keyB64 = key.toString("base64");

function decrypt(
  encrypted: Uint8Array,
  packetId: number,
  from: number,
): Uint8Array {
  const nonce = Buffer.alloc(16);
  nonce.writeUInt32LE(packetId, 0);
  nonce.writeUInt32LE(from, 8);
  const decipher = createDecipheriv("aes-128-ctr", key, nonce);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

describe("buildMqttAnnouncement", () => {
  it("construit un paquet texte Meshtastic chiffré sur le canal choisi", () => {
    const result = buildMqttAnnouncement({
      rootTopic: "msh/EU_868",
      channel: "Fr_EMCOM",
      channelKey: keyB64,
      nodeId: "!1234abcd",
      message: "Alerte générale",
      packetId: 0x10203040,
    });

    expect(result.topic).toBe(
      "msh/EU_868/2/e/Fr_EMCOM/!1234abcd",
    );

    const envelope = ServiceEnvelope.toObject(
      ServiceEnvelope.decode(result.payload),
    ) as {
      channel_id: string;
      gateway_id: string;
      packet: {
        from: number;
        to: number;
        channel: number;
        encrypted: Uint8Array;
        id: number;
        hop_limit: number;
        via_mqtt: boolean;
        hop_start: number;
      };
    };

    expect(envelope.channel_id).toBe("Fr_EMCOM");
    expect(envelope.gateway_id).toBe("!1234abcd");
    expect(envelope.packet).toMatchObject({
      from: 0x1234abcd,
      to: 0xffffffff,
      id: 0x10203040,
      hop_limit: 3,
      hop_start: 3,
      via_mqtt: true,
    });

    const data = Data.toObject(
      Data.decode(
        decrypt(
          envelope.packet.encrypted,
          envelope.packet.id,
          envelope.packet.from,
        ),
      ),
    ) as { portnum: number; payload: Uint8Array };

    expect(data.portnum).toBe(1);
    expect(Buffer.from(data.payload).toString("utf8")).toBe("Alerte générale");
  });

  it("calcule le hash Meshtastic à partir du nom et de la PSK", () => {
    const result = buildMqttAnnouncement({
      rootTopic: "msh/EU_868",
      channel: "Fr_EMCOM",
      channelKey: keyB64,
      nodeId: "!1234abcd",
      message: "Test",
      packetId: 1,
    });

    const envelope = ServiceEnvelope.toObject(
      ServiceEnvelope.decode(result.payload),
    ) as { packet: { channel: number } };
    const expected = Buffer.from("Fr_EMCOM").reduce(
      (hash, byte) => hash ^ byte,
      key.reduce((hash, byte) => hash ^ byte, 0),
    );
    expect(envelope.packet.channel).toBe(expected);
  });

  it("refuse les paramètres qui ne peuvent pas produire une annonce valide", () => {
    const valid = {
      rootTopic: "msh/EU_868",
      channel: "Fr_EMCOM",
      channelKey: keyB64,
      nodeId: "!1234abcd",
      message: "Test",
      packetId: 1,
    };

    expect(() => buildMqttAnnouncement({ ...valid, message: "   " })).toThrow();
    expect(() =>
      buildMqttAnnouncement({ ...valid, message: "é".repeat(101) }),
    ).toThrow();
    expect(() =>
      buildMqttAnnouncement({ ...valid, nodeId: "1234abcd" }),
    ).toThrow();
    expect(() =>
      buildMqttAnnouncement({ ...valid, channel: "Fr/EMCOM" }),
    ).toThrow();
    expect(() =>
      buildMqttAnnouncement({ ...valid, rootTopic: "autre/EU_868" }),
    ).toThrow();
  });
});
