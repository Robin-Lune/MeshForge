import { describe, it, expect, vi, beforeEach } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: { query } }));

import { toNodeMapLinks, getNodeMapLinks } from "./node-map-links";

type Rows = Parameters<typeof toNodeMapLinks>[0];

describe("toNodeMapLinks", () => {
  it("coerce snr/hop/sources, position exacte si relais fixe", () => {
    expect(
      toNodeMapLinks([
        {
          nodeId: "!a", name: "A", snr: "3.14", hop: "0", lat: -21, lon: 55,
          isMobile: false, sources: { direct_packets: "12", neighborinfo: 1 },
        },
      ] as Rows),
    ).toEqual([
      { nodeId: "!a", name: "A", snr: 3.1, hop: 0, lat: -21, lon: 55, sources: { direct_packets: 12, neighborinfo: 1 } },
    ]);
  });

  it("floute un mobile ; snr/hop/sources null gérés", () => {
    const [r] = toNodeMapLinks([
      { nodeId: "!a", name: null, snr: null, hop: null, lat: -21.117, lon: 55.537, isMobile: true, sources: null },
    ] as Rows);
    expect(r.lat).not.toBe(-21.117);
    expect(r.snr).toBeNull();
    expect(r.hop).toBeNull();
    expect(r.sources).toEqual({});
  });
});

describe("getNodeMapLinks", () => {
  beforeEach(() => query.mockReset());

  it("interroge par node et normalise", async () => {
    query.mockResolvedValue({
      rows: [{ nodeId: "!a", name: "A", snr: 5, hop: 0, lat: -21, lon: 55, isMobile: false, sources: { direct_packets: 1 } }],
    });
    const out = await getNodeMapLinks("!x");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["!x"]);
    expect(out[0].sources).toEqual({ direct_packets: 1 });
  });
});
