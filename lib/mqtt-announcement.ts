import { randomBytes } from "crypto";
import mqtt from "mqtt";
import protobuf from "protobufjs";
import {
  encryptMeshtasticPayload,
  meshtasticChannelHash,
  normalizeMeshtasticKey,
} from "./meshtastic-crypto";

const MAX_MESSAGE_BYTES = 200;
const CHANNEL_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ROOT_TOPIC_RE = /^msh\/[A-Za-z0-9_-]+$/;
const NODE_ID_RE = /^![0-9a-fA-F]{8}$/;

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

type ChannelKeys = Record<string, string>;

export interface MqttAnnouncementInput {
  rootTopic: string;
  channel: string;
  channelKey: string;
  nodeId: string;
  message: string;
  packetId: number;
}

export function parseChannelKeys(raw: string | undefined): ChannelKeys {
  if (!raw?.trim()) return {};
  return Object.fromEntries(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [channel, key] = entry.split(":");
        return [channel?.trim(), key?.trim()];
      })
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  );
}

export function buildMqttAnnouncement(
  input: MqttAnnouncementInput,
): { topic: string; payload: Buffer } {
  const rootTopic = input.rootTopic.trim().replace(/\/+$/, "");
  const channel = input.channel.trim();
  const nodeId = input.nodeId.trim().toLowerCase();
  const message = input.message.trim();
  const messagePayload = Buffer.from(message, "utf8");

  if (!ROOT_TOPIC_RE.test(rootTopic)) {
    throw new Error("Racine MQTT invalide.");
  }
  if (!CHANNEL_RE.test(channel)) {
    throw new Error("Canal invalide.");
  }
  if (!NODE_ID_RE.test(nodeId)) {
    throw new Error("Le NodeID d'annonce doit être au format !xxxxxxxx.");
  }
  if (!messagePayload.length || messagePayload.length > MAX_MESSAGE_BYTES) {
    throw new Error(
      `L'annonce doit contenir entre 1 et ${MAX_MESSAGE_BYTES} octets UTF-8.`,
    );
  }
  if (
    !Number.isInteger(input.packetId) ||
    input.packetId <= 0 ||
    input.packetId > 0xffffffff
  ) {
    throw new Error("Identifiant de paquet invalide.");
  }
  if (normalizeMeshtasticKey(input.channelKey).length === 0) {
    throw new Error(`La clé du canal ${channel} ne permet pas le chiffrement.`);
  }

  const from = Number.parseInt(nodeId.slice(1), 16) >>> 0;
  const data = Data.encode(
    Data.create({ portnum: 1, payload: messagePayload }),
  ).finish();
  const encrypted = encryptMeshtasticPayload(
    data,
    input.channelKey,
    input.packetId,
    from,
  );
  const payload = Buffer.from(
    ServiceEnvelope.encode(
      ServiceEnvelope.create({
        channel_id: channel,
        gateway_id: nodeId,
        packet: {
          from,
          to: 0xffffffff,
          channel: meshtasticChannelHash(channel, input.channelKey),
          encrypted,
          id: input.packetId,
          hop_limit: 3,
          via_mqtt: true,
          hop_start: 3,
        },
      }),
    ).finish(),
  );

  return {
    topic: `${rootTopic}/2/e/${channel}/${nodeId}`,
    payload,
  };
}

export async function publishMqttAnnouncement(
  input: Omit<MqttAnnouncementInput, "packetId">,
): Promise<void> {
  const url = process.env.MQTT_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  if (!url) {
    throw new Error("Connexion MQTT non configurée.");
  }

  const packet = buildMqttAnnouncement({
    ...input,
    packetId: randomBytes(4).readUInt32LE(0) || 1,
  });

  await new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(url, {
      username: username || undefined,
      password: password || undefined,
      reconnectPeriod: 0,
      connectTimeout: 5_000,
    });
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("Délai MQTT dépassé.")),
      10_000,
    );

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.end(true);
      if (error) reject(error);
      else resolve();
    }

    client.once("error", finish);
    client.once("connect", () => {
      client.publish(
        packet.topic,
        packet.payload,
        { qos: 1, retain: false },
        (error) => finish(error ?? undefined),
      );
    });
  });
}
