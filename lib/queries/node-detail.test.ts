import { describe, it, expect } from "vitest";
import {
  toHistoryPoints,
  toGatewayLinks,
  toDeviceMetrics,
} from "./node-detail";

// Série journalière (courbes 30j). pg : date_trunc → Date ; AVG/COUNT → string|number.
describe("toHistoryPoints", () => {
  it("mappe le jour en ISO court + coerce snr/battery/packets", () => {
    expect(
      toHistoryPoints([
        {
          day: new Date("2026-06-01T00:00:00Z"),
          snr: "5.5",
          battery: "80",
          packets: "12",
        },
      ]),
    ).toEqual([{ day: "2026-06-01", snr: 5.5, battery: 80, packets: 12 }]);
  });

  it("préserve snr/battery null (pas de mesure ce jour-là)", () => {
    const p = toHistoryPoints([
      { day: new Date("2026-06-02T00:00:00Z"), snr: null, battery: null, packets: "3" },
    ])[0];
    expect(p.snr).toBeNull();
    expect(p.battery).toBeNull();
    expect(p.packets).toBe(3);
  });
});

// Liens vers les gateways (multi-SNR pour un nœud-pont). bestHop 0 = lien direct.
describe("toGatewayLinks", () => {
  it("coerce snr/bestHop/packets et garde le nom du gateway", () => {
    expect(
      toGatewayLinks([
        {
          gatewayId: "!gw1",
          gatewayName: "GW Un",
          snr: "3.2",
          bestHop: "0",
          packets: "9",
          gwLat: null,
          gwLon: null,
        },
      ]),
    ).toEqual([
      {
        gatewayId: "!gw1",
        gatewayName: "GW Un",
        snr: 3.2,
        bestHop: 0,
        packets: 9,
        distanceKm: null,
      },
    ]);
  });

  it("gère un gateway sans nom + hop null", () => {
    const l = toGatewayLinks([
      {
        gatewayId: "!gw2",
        gatewayName: null,
        snr: null,
        bestHop: null,
        packets: "1",
        gwLat: null,
        gwLon: null,
      },
    ])[0];
    expect(l.gatewayName).toBeNull();
    expect(l.snr).toBeNull();
    expect(l.bestHop).toBeNull();
    expect(l.distanceKm).toBeNull();
  });

  it("calcule la distance node ↔ gateway quand les 2 positions sont connues", () => {
    const l = toGatewayLinks(
      [
        {
          gatewayId: "!gw3",
          gatewayName: "GW Loin",
          snr: "1.0",
          bestHop: "0",
          packets: "5",
          gwLat: -21.3393,
          gwLon: 55.4781,
        },
      ],
      -20.8789, // position du node
      55.4481,
    )[0];
    expect(l.distanceKm).toBeGreaterThan(48);
    expect(l.distanceKm).toBeLessThan(54);
  });

  it("distance null si le node n'a pas de position", () => {
    const l = toGatewayLinks([
      {
        gatewayId: "!gw4",
        gatewayName: "GW",
        snr: "1.0",
        bestHop: "0",
        packets: "5",
        gwLat: -21.3,
        gwLon: 55.4,
      },
    ])[0];
    expect(l.distanceKm).toBeNull();
  });
});

// Dernières métriques device (déjà captées en colonnes, simplement remontées).
describe("toDeviceMetrics", () => {
  it("coerce et arrondit voltage (2 déc.) + utilisations (1 déc.)", () => {
    expect(
      toDeviceMetrics({ voltage: "3.917", channelUtil: "12.34", airUtilTx: "5.67" }),
    ).toEqual({ voltage: 3.92, channelUtil: 12.3, airUtilTx: 5.7 });
  });

  it("met tout à null si aucune métrique (node sans télémétrie)", () => {
    expect(toDeviceMetrics(undefined)).toEqual({
      voltage: null,
      channelUtil: null,
      airUtilTx: null,
    });
  });
});
