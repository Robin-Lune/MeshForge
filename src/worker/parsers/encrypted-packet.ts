import { createCipheriv, createDecipheriv } from "crypto";
import protobuf from "protobufjs";
import type { ParsedPacket, RawMeshtasticPacket } from "../../../types";
import { deviceRoleName, hardwareModelName } from "../meshtastic/enums";
import { decodeTraceSnr } from "./parser-utils";
import { neighborReports } from "./neighbor-info";
import { tracerouteInfo } from "./traceroute";
import { matchingTextMarker } from "./text-message";

const PORTNUM = {
  TEXT_MESSAGE_APP: 1,
  POSITION_APP: 3,
  NODEINFO_APP: 4,
  TRACEROUTE_APP: 70,
  NEIGHBORINFO_APP: 71,
  TELEMETRY_APP: 67,
} as const;

const DEFAULT_PSK = Buffer.from([
  0xd4, 0xf1, 0xbb, 0x3a, 0x20, 0x29, 0x07, 0x59,
  0xf0, 0xbc, 0xff, 0xab, 0xcf, 0x4e, 0x69, 0x01,
]);

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
  bool want_ack = 10;
  uint32 priority = 11;
  int32 rx_rssi = 12;
  uint32 hop_start = 15;
}

message Data {
  uint32 portnum = 1;
  bytes payload = 2;
  bool want_response = 3;
  uint32 bitfield = 9;
}

message Position {
  sfixed32 latitude_i = 1;
  sfixed32 longitude_i = 2;
  int32 altitude = 3;
  fixed32 time = 4;
  uint32 precision_bits = 23;
}

message User {
  string id = 1;
  string long_name = 2;
  string short_name = 3;
  uint32 hw_model = 5;
  bool is_licensed = 6;
  uint32 role = 7;
}

message DeviceMetrics {
  uint32 battery_level = 1;
  float voltage = 2;
  float channel_utilization = 3;
  float air_util_tx = 4;
  uint32 uptime_seconds = 5;
}

message Telemetry {
  fixed32 time = 1;
  DeviceMetrics device_metrics = 2;
}

message NeighborInfo {
  uint32 node_id = 1;
  uint32 last_sent_by_id = 2;
  uint32 node_broadcast_interval_secs = 3;
  repeated Neighbor neighbors = 4;
}

message Neighbor {
  uint32 node_id = 1;
  float snr = 2;
  fixed32 last_rx_time = 3;
  uint32 node_broadcast_interval_secs = 4;
}

message RouteDiscovery {
  repeated fixed32 route = 1;
  repeated int32 snr_towards = 2;
  repeated fixed32 route_back = 3;
  repeated int32 snr_back = 4;
}
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const ServiceEnvelope = root.lookupType("meshtastic.ServiceEnvelope");
const Data = root.lookupType("meshtastic.Data");
const Position = root.lookupType("meshtastic.Position");
const User = root.lookupType("meshtastic.User");
const Telemetry = root.lookupType("meshtastic.Telemetry");
const NeighborInfo = root.lookupType("meshtastic.NeighborInfo");
const RouteDiscovery = root.lookupType("meshtastic.RouteDiscovery");

type ChannelKeys = Record<string, string>;
type DebugLog = (message: string) => void;

type DecodedEnvelope = {
  packet?: {
    from?: number;
    to?: number;
    channel?: number;
    decoded?: {
      portnum?: number;
      payload?: Uint8Array;
    };
    encrypted?: Uint8Array;
    id?: number;
    rx_time?: number;
    rx_snr?: number;
    rx_rssi?: number;
    hop_limit?: number;
    hop_start?: number;
  };
  channel_id?: string;
  gateway_id?: string;
};

type DecodedData = {
  portnum?: number;
  payload?: Uint8Array;
  want_response?: boolean;
};

type DecodedNeighborInfo = {
  node_id?: number;
  neighbors?: { node_id?: number; snr?: number }[];
};

type DecodedRouteDiscovery = {
  route?: number[];
  snr_towards?: number[];
  route_back?: number[];
  snr_back?: number[];
};

type DecodedPosition = {
  latitude_i?: number;
  longitude_i?: number;
  altitude?: number;
  precision_bits?: number;
};

type DecodedUser = {
  long_name?: string;
  short_name?: string;
  hw_model?: number;
  role?: number;
};

type DecodedTelemetry = {
  device_metrics?: {
    battery_level?: number;
    voltage?: number;
    channel_utilization?: number;
    air_util_tx?: number;
  };
};

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

export function encryptMeshtasticPayload(
  payload: Uint8Array,
  keyB64: string,
  packetId: number,
  from: number,
): Buffer {
  const key = normalizeKey(keyB64);
  const cipher = createCipheriv(
    cipherName(key),
    key,
    nonce(packetId, from),
  );
  return Buffer.concat([cipher.update(payload), cipher.final()]);
}

function decryptMeshtasticPayload(
  payload: Uint8Array,
  keyB64: string,
  packetId: number,
  from: number,
): Buffer {
  const key = normalizeKey(keyB64);
  const decipher = createDecipheriv(cipherName(key), key, nonce(packetId, from));
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

function normalizeKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length === 16 || key.length === 32) return key;
  if (key.length === 1) {
    if (key[0] === 0) return Buffer.alloc(0);
    const psk = Buffer.from(DEFAULT_PSK);
    psk[psk.length - 1] = (psk[psk.length - 1] + key[0] - 1) & 0xff;
    return psk;
  }

  const normalized = Buffer.alloc(key.length < 16 ? 16 : 32);
  key.copy(normalized);
  return normalized;
}

function cipherName(key: Buffer): "aes-128-ctr" | "aes-256-ctr" {
  return key.length === 32 ? "aes-256-ctr" : "aes-128-ctr";
}

function nonce(packetId: number, from: number): Buffer {
  const out = Buffer.alloc(16);
  out.writeUInt32LE(packetId >>> 0, 0);
  out.writeUInt32LE(from >>> 0, 8);
  return out;
}

function toNodeId(num: number): string {
  return "!" + (num >>> 0).toString(16).padStart(8, "0");
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function hopCount(packet: DecodedEnvelope["packet"]): number | null {
  if (!packet) return null;
  const start = numOrNull(packet.hop_start);
  const limit = numOrNull(packet.hop_limit);
  if (start === null || limit === null || start < limit) return null;
  return start - limit;
}

function decodeData(packet: NonNullable<DecodedEnvelope["packet"]>, keyB64: string): DecodedData | null {
  if (packet.decoded) return packet.decoded;
  if (!packet.encrypted || typeof packet.id !== "number" || typeof packet.from !== "number") {
    return null;
  }

  try {
    const decrypted = decryptMeshtasticPayload(
      packet.encrypted,
      keyB64,
      packet.id,
      packet.from,
    );
    const data = Data.toObject(Data.decode(decrypted)) as DecodedData;
    return typeof data.portnum === "number" ? data : null;
  } catch {
    return null;
  }
}

export function parseEncryptedPacket(
  topic: string,
  message: Uint8Array,
  publicChannels: string[],
  channelKeys: ChannelKeys,
  debug?: DebugLog,
): ParsedPacket | null {
  if (!topic.includes("/e/")) return null;

  debug?.(`rx topic=${topic} bytes=${message.length}`);
  const envelope = ServiceEnvelope.toObject(
    ServiceEnvelope.decode(message),
  ) as DecodedEnvelope;
  const packet = envelope.packet;
  if (typeof packet?.from !== "number") {
    debug?.("drop: envelope sans packet.from numérique");
    return null;
  }

  const channel = strOrNull(envelope.channel_id);
  debug?.(
    `envelope channel=${channel ?? "(none)"} gateway=${envelope.gateway_id ?? "(none)"} from=${toNodeId(packet.from)} encrypted=${packet.encrypted?.length ?? 0} decoded=${packet.decoded ? "yes" : "no"}`,
  );
  if (!channel || !publicChannels.includes(channel)) {
    debug?.(`drop: canal non public (${channel ?? "absent"})`);
    return null;
  }

  const key = channelKeys[channel];
  if (!key && !packet.decoded) {
    debug?.(`drop: pas de clé pour ${channel}`);
    return null;
  }

  const data = decodeData(packet, key);
  if (!data?.payload) {
    debug?.("drop: déchiffrement ou Data protobuf impossible");
    if (packet.encrypted?.length) {
      debug?.(
        `fixture topic=${topic} channel=${channel} gateway=${envelope.gateway_id ?? "(none)"} from=${toNodeId(packet.from)} packet_b64=${Buffer.from(message).toString("base64")}`,
      );
    }
    return null;
  }
  debug?.(`data portnum=${data.portnum ?? "(none)"} payload=${data.payload.length}`);

  const baseRaw: RawMeshtasticPacket = {
    source: "protobuf",
    from: packet.from,
    to: packet.to,
    sender: strOrNull(envelope.gateway_id) ?? undefined,
    channel: packet.channel,
    rssi: numOrNull(packet.rx_rssi) ?? undefined,
    snr: numOrNull(packet.rx_snr) ?? undefined,
    hop_start: packet.hop_start,
    hops_away: hopCount(packet) ?? undefined,
    id: packet.id,
    timestamp: packet.rx_time,
  };

  if (data.portnum === PORTNUM.POSITION_APP) {
    const position = Position.toObject(Position.decode(data.payload)) as DecodedPosition;
    return packetFromPosition(packet, envelope, channel, baseRaw, position);
  }

  if (data.portnum === PORTNUM.TEXT_MESSAGE_APP) {
    return packetFromText(packet, envelope, channel, baseRaw, data.payload, debug);
  }

  if (data.portnum === PORTNUM.NODEINFO_APP) {
    const user = User.toObject(User.decode(data.payload)) as DecodedUser;
    return packetFromUser(packet, envelope, channel, baseRaw, user);
  }

  if (data.portnum === PORTNUM.TELEMETRY_APP) {
    const telemetry = Telemetry.toObject(Telemetry.decode(data.payload)) as DecodedTelemetry;
    return packetFromTelemetry(packet, envelope, channel, baseRaw, telemetry);
  }

  if (data.portnum === PORTNUM.NEIGHBORINFO_APP) {
    const info = NeighborInfo.toObject(NeighborInfo.decode(data.payload)) as DecodedNeighborInfo;
    return basePacket(packet, envelope, channel, { ...baseRaw, type: "neighborinfo" }, {
      packetType: "neighborinfo",
      neighbors: neighborReports(packet.from as number, info.neighbors),
    });
  }

  if (data.portnum === PORTNUM.TRACEROUTE_APP) {
    const rd = RouteDiscovery.toObject(RouteDiscovery.decode(data.payload)) as DecodedRouteDiscovery;
    const traceroute = tracerouteInfo({
      from: packet.from as number,
      to: numOrNull(packet.to),
      packetId: numOrNull(packet.id),
      route: (rd.route ?? []).map(Number),
      snrTowards: decodeTraceSnr(rd.snr_towards),
      routeBack: (rd.route_back ?? []).map(Number),
      snrBack: decodeTraceSnr(rd.snr_back),
      isRequest: data.want_response === true,
    });
    return basePacket(packet, envelope, channel, { ...baseRaw, type: "traceroute" }, {
      packetType: "traceroute",
      traceroute: traceroute ?? undefined,
    });
  }

  debug?.(`drop: portnum ignoré (${data.portnum ?? "absent"})`);
  return null;
}

function packetFromText(
  packet: NonNullable<DecodedEnvelope["packet"]>,
  envelope: DecodedEnvelope,
  channel: string,
  raw: RawMeshtasticPacket,
  payload: Uint8Array,
  debug?: DebugLog,
): ParsedPacket | null {
  const text = Buffer.from(payload).toString("utf8");
  const textRaw: RawMeshtasticPacket = {
    ...raw,
    type: "text",
    payload: text,
  };
  const marker = matchingTextMarker(textRaw);
  if (!marker) {
    debug?.(`drop: texte sans marqueur autorisé (${channel})`);
    return null;
  }
  debug?.(`allow: texte ${marker} (${channel})`);

  return basePacket(packet, envelope, channel, textRaw, {
    packetType: "text",
  });
}

function packetFromPosition(
  packet: NonNullable<DecodedEnvelope["packet"]>,
  envelope: DecodedEnvelope,
  channel: string,
  raw: RawMeshtasticPacket,
  position: DecodedPosition,
): ParsedPacket {
  const latRaw = numOrNull(position.latitude_i);
  const lonRaw = numOrNull(position.longitude_i);
  return basePacket(packet, envelope, channel, {
    ...raw,
    type: "position",
    payload: {
      latitude_i: position.latitude_i,
      longitude_i: position.longitude_i,
      altitude: position.altitude,
      precision_bits: position.precision_bits,
    },
  }, {
    packetType: "position",
    lat: latRaw !== null ? latRaw / 1e7 : null,
    lon: lonRaw !== null ? lonRaw / 1e7 : null,
    altitude: numOrNull(position.altitude),
  });
}

function packetFromUser(
  packet: NonNullable<DecodedEnvelope["packet"]>,
  envelope: DecodedEnvelope,
  channel: string,
  raw: RawMeshtasticPacket,
  user: DecodedUser,
): ParsedPacket {
  return basePacket(packet, envelope, channel, {
    ...raw,
    type: "nodeinfo",
    payload: {
      longname: user.long_name,
      shortname: user.short_name,
      hardware: user.hw_model,
      role: user.role,
    },
  }, {
    packetType: "nodeinfo",
    longName: strOrNull(user.long_name),
    shortName: strOrNull(user.short_name),
    hwModel: hardwareModelName(user.hw_model),
    role: deviceRoleName(user.role),
  });
}

function packetFromTelemetry(
  packet: NonNullable<DecodedEnvelope["packet"]>,
  envelope: DecodedEnvelope,
  channel: string,
  raw: RawMeshtasticPacket,
  telemetry: DecodedTelemetry,
): ParsedPacket {
  const metrics = telemetry.device_metrics ?? {};
  return basePacket(packet, envelope, channel, {
    ...raw,
    type: "telemetry",
    payload: {
      battery_level: metrics.battery_level,
      voltage: metrics.voltage,
      channel_utilization: metrics.channel_utilization,
      air_util_tx: metrics.air_util_tx,
    },
  }, {
    packetType: "telemetry",
    batteryPct: numOrNull(metrics.battery_level),
    voltage: numOrNull(metrics.voltage),
    channelUtil: numOrNull(metrics.channel_utilization),
    airUtilTx: numOrNull(metrics.air_util_tx),
  });
}

function basePacket(
  packet: NonNullable<DecodedEnvelope["packet"]>,
  envelope: DecodedEnvelope,
  channel: string,
  raw: RawMeshtasticPacket,
  overrides: Partial<ParsedPacket>,
): ParsedPacket {
  return {
    gatewayId: strOrNull(envelope.gateway_id),
    nodeId: toNodeId(packet.from as number),
    packetType: null,
    channel,
    lat: null,
    lon: null,
    altitude: null,
    rssi: numOrNull(packet.rx_rssi),
    snr: numOrNull(packet.rx_snr),
    hopCount: hopCount(packet),
    batteryPct: null,
    voltage: null,
    channelUtil: null,
    airUtilTx: null,
    longName: null,
    shortName: null,
    hwModel: null,
    firmware: null,
    role: null,
    raw,
    ...overrides,
  };
}
