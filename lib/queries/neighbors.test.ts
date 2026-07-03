import { describe, it, expect, vi, beforeEach } from "vitest";

const { query, connect, clientQuery, release } = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const release = vi.fn();
  return {
    query: vi.fn(),
    clientQuery,
    release,
    connect: vi.fn(async () => ({ query: clientQuery, release })),
  };
});
vi.mock("../db", () => ({ pool: { query, connect } }));

import { toNodeNeighbors, getNodeNeighbors, insertNodeNeighbors } from "./neighbors";

type Rows = Parameters<typeof toNodeNeighbors>[0];

describe("toNodeNeighbors", () => {
  it("arrondit le SNR (0,1), ISO la date, position exacte si relais fixe", () => {
    const d = new Date("2026-07-01T10:00:00Z");
    expect(
      toNodeNeighbors([
        { nodeId: "!n", name: "N", snr: "3.14", lat: -21, lon: 55, isMobile: false, lastSeen: d },
      ] as Rows),
    ).toEqual([
      { nodeId: "!n", name: "N", snr: 3.1, lat: -21, lon: 55, lastSeen: d.toISOString() },
    ]);
  });

  it("floute la position d'un voisin mobile (is_mobile != FALSE)", () => {
    const [r] = toNodeNeighbors([
      { nodeId: "!n", name: "N", snr: 5, lat: -21.117, lon: 55.537, isMobile: true, lastSeen: null },
    ] as Rows);
    // Position snappée : décalée de l'exacte, mais toujours définie.
    expect(r.lat).not.toBe(-21.117);
    expect(typeof r.lat).toBe("number");
  });

  it("préserve snr / lastSeen / position null (voisin jamais localisé)", () => {
    const [r] = toNodeNeighbors([
      { nodeId: "!n", name: null, snr: null, lat: null, lon: null, isMobile: null, lastSeen: null },
    ] as Rows);
    expect(r.snr).toBeNull();
    expect(r.lastSeen).toBeNull();
    expect(r.lat).toBeNull();
  });
});

describe("insertNodeNeighbors", () => {
  beforeEach(() => {
    clientQuery.mockReset();
    clientQuery.mockResolvedValue({});
    release.mockReset();
  });

  it("insère chaque voisin dans une transaction (reporter/gateway/canal)", async () => {
    await insertNodeNeighbors(
      "!rep",
      [{ neighborId: "!a", snr: 5 }, { neighborId: "!b", snr: null }],
      "!gw",
      "Fr_Balise",
    );
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    const inserts = clientQuery.mock.calls.filter((c) => Array.isArray(c[1]));
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]).toEqual(["!rep", "!a", 5, "!gw", "Fr_Balise"]);
    expect(inserts[1][1]).toEqual(["!rep", "!b", null, "!gw", "Fr_Balise"]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("getNodeNeighbors", () => {
  beforeEach(() => query.mockReset());

  it("interroge par node et normalise", async () => {
    const d = new Date("2026-07-01T10:00:00Z");
    query.mockResolvedValue({
      rows: [{ nodeId: "!a", name: "A", snr: 5, lat: -21, lon: 55, isMobile: false, lastSeen: d }],
    });
    const out = await getNodeNeighbors("!rep");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["!rep"]);
    expect(out).toEqual([
      { nodeId: "!a", name: "A", snr: 5, lat: -21, lon: 55, lastSeen: d.toISOString() },
    ]);
  });
});
