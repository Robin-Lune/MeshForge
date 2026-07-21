import protobuf from "protobufjs";
import type { ParsedPacket, RawMeshtasticPacket } from "../../../types";
import { deviceRoleName, hardwareModelName } from "../meshtastic/enums";
import { decodePosition } from "./parser-utils";

const MAP_REPORT_PORTNUM = 73;

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

message MapReport {
  string long_name = 1;
  string short_name = 2;
  uint32 role = 3;
  uint32 hw_model = 4;
  string firmware_version = 5;
  uint32 region = 6;
  uint32 modem_preset = 7;
  bool has_default_channel = 8;
  sfixed32 latitude_i = 9;
  sfixed32 longitude_i = 10;
  int32 altitude = 11;
  uint32 position_precision = 12;
  uint32 num_online_local_nodes = 13;
  bool has_opted_report_location = 14;
}
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const ServiceEnvelope = root.lookupType("meshtastic.ServiceEnvelope");
const MapReport = root.lookupType("meshtastic.MapReport");

type DecodedEnvelope = {
  packet?: {
    from?: number;
    to?: number;
    channel?: number;
    decoded?: {
      portnum?: number;
      payload?: Uint8Array;
    };
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

type DecodedMapReport = {
  long_name?: string;
  short_name?: string;
  role?: number;
  hw_model?: number;
  firmware_version?: string;
  latitude_i?: number;
  longitude_i?: number;
  altitude?: number;
  position_precision?: number;
  num_online_local_nodes?: number;
  has_opted_report_location?: boolean;
};

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

export function parseMapReport(
  topic: string,
  message: Uint8Array,
  publicChannels: string[],
): ParsedPacket | null {
  if (!topic.includes("/map/")) return null;

  const envelope = ServiceEnvelope.toObject(
    ServiceEnvelope.decode(message),
  ) as DecodedEnvelope;
  const packet = envelope.packet;
  const payload = packet?.decoded?.payload;
  if (typeof packet?.from !== "number" || !payload) return null;
  if (packet.decoded?.portnum !== MAP_REPORT_PORTNUM) return null;

  const channel = strOrNull(envelope.channel_id);
  if (!channel || !publicChannels.includes(channel)) return null;

  const report = MapReport.toObject(MapReport.decode(payload)) as DecodedMapReport;
  const canShareLocation = report.has_opted_report_location === true;
  const position = canShareLocation
    ? decodePosition(report.latitude_i, report.longitude_i)
    : { lat: null, lon: null };

  const raw: RawMeshtasticPacket = {
    source: "map_report",
    from: packet.from,
    to: packet.to,
    sender: strOrNull(envelope.gateway_id) ?? undefined,
    type: "map_report",
    channel: packet.channel,
    rssi: numOrNull(packet.rx_rssi) ?? undefined,
    snr: numOrNull(packet.rx_snr) ?? undefined,
    hop_start: packet.hop_start,
    hops_away: hopCount(packet) ?? undefined,
    id: packet.id,
    timestamp: packet.rx_time,
    payload: {
      longname: report.long_name,
      shortname: report.short_name,
      hardware: report.hw_model,
      role: report.role,
      firmware_version: report.firmware_version,
      latitude_i: canShareLocation ? report.latitude_i : undefined,
      longitude_i: canShareLocation ? report.longitude_i : undefined,
      altitude: canShareLocation ? report.altitude : undefined,
      precision_bits: report.position_precision,
      num_online_local_nodes: report.num_online_local_nodes,
      has_opted_report_location: report.has_opted_report_location,
    },
  };

  return {
    gatewayId: strOrNull(envelope.gateway_id),
    nodeId: toNodeId(packet.from),
    packetType: "map_report",
    channel,
    lat: position.lat,
    lon: position.lon,
    altitude: canShareLocation ? numOrNull(report.altitude) : null,
    rssi: numOrNull(packet.rx_rssi),
    snr: numOrNull(packet.rx_snr),
    hopCount: hopCount(packet),
    batteryPct: null,
    voltage: null,
    channelUtil: null,
    airUtilTx: null,
    longName: strOrNull(report.long_name),
    shortName: strOrNull(report.short_name),
    hwModel: hardwareModelName(report.hw_model),
    firmware: strOrNull(report.firmware_version),
    // Même piège proto3 que le NodeInfo : rôle CLIENT (enum 0) absent du fil
    // -> `report.role` undefined. `?? 0` pour ne pas perdre un passage en CLIENT.
    role: deviceRoleName(report.role ?? 0),
    raw,
  };
}
