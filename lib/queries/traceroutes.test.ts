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

import {
  toNodeTraceroutes,
  getNodeTraceroutes,
  insertTracerouteSegments,
} from "./traceroutes";
import type { RawMeshtasticPacket, TracerouteInfo } from "../../types";

type Rows = Parameters<typeof toNodeTraceroutes>[0];

const row = (r: Partial<Rows[number]> & Pick<Rows[number], "packetId" | "sourceNode" | "targetNode" | "receivedAt" | "direction" | "step" | "fromNode" | "toNode">): Rows[number] => ({
  fromName: null,
  fromLat: null,
  fromLon: null,
  fromIsMobile: null,
  toName: null,
  toLat: null,
  toLon: null,
  toIsMobile: null,
  snr: null,
  ...r,
});

describe("toNodeTraceroutes", () => {
  it("groupe les segments par traceroute, calcule otherNode et arrondit le SNR", () => {
    const d = new Date("2026-07-01T10:00:00Z");
    const rows = [
      row({ packetId: 7, sourceNode: "!a", targetNode: "!d", receivedAt: d, direction: "forward", step: 0, fromNode: "!a", fromName: "A", toNode: "!b", toName: "B", snr: "6.04" }),
      row({ packetId: 7, sourceNode: "!a", targetNode: "!d", receivedAt: d, direction: "forward", step: 1, fromNode: "!b", fromName: "B", toNode: "!d", snr: null }),
    ];
    const out = toNodeTraceroutes(rows, "!a");
    expect(out).toHaveLength(1);
    expect(out[0].otherNode).toBe("!d"); // le node consulté est la source
    expect(out[0].hops).toHaveLength(2);
    expect(out[0].hops[0].snr).toBe(6);
    expect(out[0].hops[1].snr).toBeNull();
  });

  it("otherNode = source quand le node consulté est la destination", () => {
    const d = new Date("2026-07-01T10:00:00Z");
    const rows = [
      row({ packetId: 1, sourceNode: "!a", targetNode: "!d", receivedAt: d, direction: "forward", step: 0, fromNode: "!a", toNode: "!d" }),
    ];
    expect(toNodeTraceroutes(rows, "!d")[0].otherNode).toBe("!a");
  });

  it("ajoute les positions floutées des sauts mobiles", () => {
    const d = new Date("2026-07-01T10:00:00Z");
    const [trace] = toNodeTraceroutes([
      row({
        packetId: 1,
        sourceNode: "!a",
        targetNode: "!d",
        receivedAt: d,
        direction: "forward",
        step: 0,
        fromNode: "!a",
        fromLat: -21.117,
        fromLon: 55.537,
        fromIsMobile: true,
        toNode: "!d",
        toLat: -21,
        toLon: 55,
        toIsMobile: false,
      }),
    ], "!a");
    expect(trace.hops[0].fromLat).not.toBe(-21.117);
    expect(trace.hops[0].toLat).toBe(-21);
  });
});

describe("insertTracerouteSegments", () => {
  beforeEach(() => {
    clientQuery.mockReset();
    clientQuery.mockResolvedValue({});
    release.mockReset();
  });

  it("insère chaque segment dans une transaction (raw sérialisé)", async () => {
    const info: TracerouteInfo = {
      sourceNode: "!a",
      targetNode: "!d",
      packetId: 7,
      segments: [{ direction: "forward", step: 0, fromNode: "!a", toNode: "!b", snr: 6 }],
    };
    const raw = { from: 1 } as RawMeshtasticPacket;
    await insertTracerouteSegments(info, "!gw", "Fr_Balise", raw);
    // BEGIN + 1 INSERT + COMMIT, un client relâché en fin de course.
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    const insertCall = clientQuery.mock.calls.find((c) => Array.isArray(c[1]));
    expect(insertCall?.[1]).toEqual([
      7, "Fr_Balise", "!a", "!d", "!gw", "forward", 0, "!a", "!b", 6, JSON.stringify(raw),
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("ROLLBACK et relâche le client si un INSERT échoue", async () => {
    clientQuery.mockImplementation((sql: string) =>
      sql.includes("INSERT INTO") ? Promise.reject(new Error("boom")) : Promise.resolve({}),
    );
    const info: TracerouteInfo = {
      sourceNode: "!a",
      targetNode: "!d",
      packetId: 7,
      segments: [{ direction: "forward", step: 0, fromNode: "!a", toNode: "!b", snr: 6 }],
    };
    await expect(
      insertTracerouteSegments(info, "!gw", "Fr_Balise", { from: 1 } as RawMeshtasticPacket),
    ).rejects.toThrow("boom");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("getNodeTraceroutes", () => {
  beforeEach(() => query.mockReset());

  it("interroge par node et reconstruit", async () => {
    const d = new Date("2026-07-01T10:00:00Z");
    query.mockResolvedValue({
      rows: [
        row({ packetId: 7, sourceNode: "!a", targetNode: "!d", receivedAt: d, direction: "forward", step: 0, fromNode: "!a", toNode: "!d" }),
      ],
    });
    const out = await getNodeTraceroutes("!a");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["!a"]);
    expect(query.mock.calls[0][0]).toContain("COALESCE(fn.short_name, fn.long_name)");
    expect(query.mock.calls[0][0]).toContain("COALESCE(tn.short_name, tn.long_name)");
    expect(query.mock.calls[0][0]).toContain("fn.excluded");
    expect(query.mock.calls[0][0]).toContain("tn.excluded");
    expect(query.mock.calls[0][0]).toContain("Node masqué");
    expect(query.mock.calls[0][0]).toContain("Node inconnu");
    expect(out[0].otherNode).toBe("!d");
  });
});
