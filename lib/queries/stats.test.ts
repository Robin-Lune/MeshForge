import { describe, it, expect } from "vitest";
import { toBuckets, buildKpi } from "./stats";

// Normalisation des répartitions (GROUP BY). pg sérialise COUNT(*) en string
// bigint ; les labels (hw_model, firmware, role...) peuvent être NULL.
describe("toBuckets — normalisation d'une répartition", () => {
  it("convertit les COUNT(*) string (bigint pg) en number", () => {
    expect(toBuckets([{ label: "position", count: "154" }])).toEqual([
      { label: "position", count: 154 },
    ]);
  });

  it("remplace un label NULL par 'inconnu' (hw_model/firmware non renseigné)", () => {
    expect(toBuckets([{ label: null, count: 3 }])).toEqual([
      { label: "inconnu", count: 3 },
    ]);
  });

  it("trie par count décroissant", () => {
    expect(
      toBuckets([
        { label: "a", count: 2 },
        { label: "b", count: 9 },
        { label: "c", count: 5 },
      ]),
    ).toEqual([
      { label: "b", count: 9 },
      { label: "c", count: 5 },
      { label: "a", count: 2 },
    ]);
  });
});

// KPI réseau assemblés depuis la ligne agrégée (AVG/COUNT renvoyés en string).
describe("buildKpi — KPI réseau", () => {
  const row = {
    nodesTotal: "381",
    nodesActive24h: "90",
    packets24h: "1440",
    avgChannelUtil: "7.3456",
    avgAirUtilTx: "2.06",
    lastPacketAt: new Date("2026-06-20T10:00:00.000Z"),
  };

  it("coerce les bigint string en number", () => {
    const kpi = buildKpi(row);
    expect(kpi.nodesTotal).toBe(381);
    expect(kpi.nodesActive24h).toBe(90);
    expect(kpi.packets24h).toBe(1440);
  });

  it("calcule paquets/min = packets24h / 1440 (arrondi 2 décimales)", () => {
    expect(buildKpi(row).packetsPerMin).toBe(1);
    expect(buildKpi({ ...row, packets24h: "2160" }).packetsPerMin).toBe(1.5);
  });

  it("arrondit les moyennes à 2 décimales", () => {
    expect(buildKpi(row).avgChannelUtil).toBe(7.35);
    expect(buildKpi(row).avgAirUtilTx).toBe(2.06);
  });

  it("renvoie null pour une moyenne absente (aucun paquet sur la fenêtre)", () => {
    expect(buildKpi({ ...row, avgChannelUtil: null }).avgChannelUtil).toBeNull();
  });

  it("formate lastPacketAt en ISO 8601, null si jamais vu", () => {
    expect(buildKpi(row).lastPacketAt).toBe("2026-06-20T10:00:00.000Z");
    expect(buildKpi({ ...row, lastPacketAt: null }).lastPacketAt).toBeNull();
  });
});
