import { describe, expect, it } from "vitest";
import protobuf from "protobufjs";
import { parseMapReport } from "./map-report";

const CHANNELS = ["Fr_Balise", "Fr_BlaBla"];
const TOPIC = "msh/EU_868/2/map/";

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

message MapReport {
  string long_name = 1;
  string short_name = 2;
  uint32 role = 3;
  uint32 hw_model = 4;
  string firmware_version = 5;
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

function packet(overrides: Record<string, unknown> = {}): Uint8Array {
  const mapReport = MapReport.encode(
    MapReport.create({
      long_name: "LM8RoNR003",
      short_name: "NR003",
      role: 0,
      hw_model: 9,
      firmware_version: "2.7.15.567b8ea08",
      latitude_i: -213588710,
      longitude_i: 556632009,
      altitude: 289,
      position_precision: 32,
      num_online_local_nodes: 4,
      has_opted_report_location: true,
      ...(overrides.mapReport as Record<string, unknown> | undefined),
    }),
  ).finish();

  return ServiceEnvelope.encode(
    ServiceEnvelope.create({
      channel_id: "Fr_Balise",
      gateway_id: "!16b21823",
      packet: {
        from: 0x16b21823,
        to: 0xffffffff,
        channel: 0,
        id: 123,
        rx_time: 1782298809,
        rx_snr: -3.75,
        rx_rssi: -97,
        hop_start: 7,
        hop_limit: 7,
        decoded: {
          portnum: 73,
          payload: mapReport,
        },
        ...(overrides.packet as Record<string, unknown> | undefined),
      },
      ...(overrides.envelope as Record<string, unknown> | undefined),
    }),
  ).finish();
}

describe("parseMapReport", () => {
  it("décode un ServiceEnvelope /map/ en paquet normalisé", () => {
    const parsed = parseMapReport(TOPIC, packet(), CHANNELS);

    expect(parsed?.gatewayId).toBe("!16b21823");
    expect(parsed?.nodeId).toBe("!16b21823");
    expect(parsed?.packetType).toBe("map_report");
    expect(parsed?.channel).toBe("Fr_Balise");
    expect(parsed?.lat).toBeCloseTo(-21.358871);
    expect(parsed?.lon).toBeCloseTo(55.6632009);
    expect(parsed?.altitude).toBe(289);
    expect(parsed?.snr).toBe(-3.75);
    expect(parsed?.rssi).toBe(-97);
    expect(parsed?.hopCount).toBe(0);
    expect(parsed?.longName).toBe("LM8RoNR003");
    expect(parsed?.shortName).toBe("NR003");
    expect(parsed?.hwModel).toBe("RAK4631");
    expect(parsed?.role).toBe("CLIENT");
    expect(parsed?.firmware).toBe("2.7.15.567b8ea08");
  });

  it("ignore les canaux hors allowlist", () => {
    const parsed = parseMapReport(
      TOPIC,
      packet({ envelope: { channel_id: "LongFast" } }),
      CHANNELS,
    );

    expect(parsed).toBeNull();
  });

  it("ignore les payloads qui ne sont pas MAP_REPORT_APP", () => {
    const parsed = parseMapReport(
      TOPIC,
      packet({ packet: { decoded: { portnum: 1, payload: new Uint8Array() } } }),
      CHANNELS,
    );

    expect(parsed).toBeNull();
  });

  it("respecte has_opted_report_location=false", () => {
    const parsed = parseMapReport(
      TOPIC,
      packet({ mapReport: { has_opted_report_location: false } }),
      CHANNELS,
    );

    expect(parsed?.lat).toBeNull();
    expect(parsed?.lon).toBeNull();
    expect(parsed?.altitude).toBeNull();
    const payload = parsed?.raw.payload;
    expect(typeof payload === "object" && payload !== null ? payload.latitude_i : undefined).toBeUndefined();
  });
});
