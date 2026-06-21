import { describe, it, expect } from "vitest";
import { toHistoryPoints, toGatewayLinks } from "./node-detail";

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
        { gatewayId: "!gw1", gatewayName: "GW Un", snr: "3.2", bestHop: "0", packets: "9" },
      ]),
    ).toEqual([
      { gatewayId: "!gw1", gatewayName: "GW Un", snr: 3.2, bestHop: 0, packets: 9 },
    ]);
  });

  it("gère un gateway sans nom + hop null", () => {
    const l = toGatewayLinks([
      { gatewayId: "!gw2", gatewayName: null, snr: null, bestHop: null, packets: "1" },
    ])[0];
    expect(l.gatewayName).toBeNull();
    expect(l.snr).toBeNull();
    expect(l.bestHop).toBeNull();
  });
});
