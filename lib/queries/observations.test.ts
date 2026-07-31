import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("../db", () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { toGatewayActivity, toObservations } from "./observations";

beforeEach(() => query.mockReset());

// Arêtes "qui a entendu qui". pg renvoie MIN(hop_count) en number ou string ;
// snr (AVG::real) en number. bestHop = 0 → lien radio direct.
describe("toObservations — arêtes gateway × node", () => {
  it("coerce bestHop/packets en number et garde snr", () => {
    expect(
      toObservations([
        { gatewayId: "!gw", nodeId: "!n1", bestHop: "0", snr: 5.5, packets: "42" },
      ]),
    ).toEqual([
      {
        gatewayId: "!gw",
        nodeId: "!n1",
        bestHop: 0,
        snr: 5.5,
        packets: 42,
        source: "gateway",
      },
    ]);
  });

  it("garde bestHop null si inconnu (hop_count absent)", () => {
    const obs = toObservations([
      { gatewayId: "!gw", nodeId: "!n1", bestHop: null, snr: null, packets: 3 },
    ]);
    expect(obs[0].bestHop).toBeNull();
    expect(obs[0].snr).toBeNull();
    expect(obs[0].packets).toBe(3);
  });

  it("propage source neighbor/traceroute, défaut gateway sinon", () => {
    const obs = toObservations([
      { gatewayId: "!a", nodeId: "!b", bestHop: 0, snr: 3, packets: 0, source: "neighbor" },
      { gatewayId: "!a", nodeId: "!c", bestHop: 0, snr: null, packets: 0, source: "traceroute" },
      { gatewayId: "!gw", nodeId: "!d", bestHop: 1, snr: 2, packets: 7, source: "inconnu" },
      { gatewayId: "!gw", nodeId: "!e", bestHop: 0, snr: 1, packets: 9 },
    ]);
    expect(obs.map((o) => o.source)).toEqual([
      "neighbor",
      "traceroute",
      "gateway",
      "gateway",
    ]);
  });
});

describe("toGatewayActivity", () => {
  it("coerce le COUNT bigint renvoyé en string par pg", () => {
    expect(
      toGatewayActivity([{ gatewayId: "!gw", directNodes1h: "12" }]),
    ).toEqual([{ gatewayId: "!gw", directNodes1h: 12 }]);
  });
});

describe("getObservations", () => {
  it("renvoie les arêtes et l'activité des passerelles", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            gatewayId: "!gw",
            nodeId: "!n1",
            bestHop: 0,
            snr: 2,
            packets: "5",
            source: "gateway",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ gatewayId: "!gw", directNodes1h: "3" }],
      });

    const { getObservations } = await import("./observations");
    await expect(getObservations()).resolves.toEqual({
      edges: [
        {
          gatewayId: "!gw",
          nodeId: "!n1",
          bestHop: 0,
          snr: 2,
          packets: 5,
          source: "gateway",
        },
      ],
      gatewayActivity: [{ gatewayId: "!gw", directNodes1h: 3 }],
    });
  });
});

describe("SELECT_GATEWAY_ACTIVITY", () => {
  /** Le SQL réellement envoyé pour l'agrégat des passerelles. */
  async function sqlDuCompteur(): Promise<string> {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const { getObservations } = await import("./observations");
    await getObservations();
    const appels = query.mock.calls.map((c) => String(c[0]));
    return appels.find((s) => s.includes("directNodes1h")) ?? "";
  }

  it("ne compte QUE les réceptions directes de la dernière heure", async () => {
    // L'invariant central du compteur : « capté » veut dire entendu en radio
    // directe, pas reçu via un relais. Un hop_count NULL est écarté par la
    // comparaison, un hop inconnu ne devant pas passer pour direct.
    const sql = await sqlDuCompteur();
    expect(sql).toContain("p.hop_count = 0");
    expect(sql).toContain("INTERVAL '1 hour'");
    expect(sql).not.toContain("INTERVAL '7 days'");
  });

  it("compte des NODES distincts, pas des paquets", async () => {
    expect(await sqlDuCompteur()).toContain("COUNT(DISTINCT p.node_id)");
  });

  it("n'applique aucune barrière au node capté, seulement à la passerelle", async () => {
    // Sa raison d'être : révéler les nodes que la carte n'affiche jamais.
    const sql = await sqlDuCompteur();
    expect(sql).toContain("NOT gw.excluded");
    expect(sql).not.toContain("nd.excluded");
    expect(sql).not.toContain("nd.last_lat");
  });

  it("écarte une passerelle qui s'entend elle-même", async () => {
    expect(await sqlDuCompteur()).toContain("p.gateway_id <> p.node_id");
  });

  it("sert la toile même si l'agrégat échoue", async () => {
    // Le compteur est un agrément ; la toile porte les liens, l'anneau et le
    // filtre par hops.
    query
      .mockResolvedValueOnce({
        rows: [
          { gatewayId: "!gw", nodeId: "!n1", bestHop: 0, snr: 1, packets: "2" },
        ],
      })
      .mockRejectedValueOnce(new Error("timeout"));
    const { getObservations } = await import("./observations");
    const r = await getObservations();
    expect(r.edges).toHaveLength(1);
    expect(r.gatewayActivity).toEqual([]);
  });

  it("propage en revanche un échec de la toile", async () => {
    query
      .mockRejectedValueOnce(new Error("base indisponible"))
      .mockResolvedValueOnce({ rows: [] });
    const { getObservations } = await import("./observations");
    await expect(getObservations()).rejects.toThrow("base indisponible");
  });
});
