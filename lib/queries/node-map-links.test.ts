import { describe, it, expect, vi, beforeEach } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: { query } }));

import { toNodeMapLinks, getNodeMapLinks } from "./node-map-links";

type Rows = Parameters<typeof toNodeMapLinks>[0];

describe("toNodeMapLinks", () => {
  it("coerce snr/hop/compteurs, position exacte si relais fixe", () => {
    expect(
      toNodeMapLinks([
        {
          nodeId: "!a", name: "A", snr: "3.14", hop: "0", lat: -21, lon: 55,
          isMobile: false, types: { position: "12", neighborinfo: 2 },
        },
      ] as Rows),
    ).toEqual([
      { nodeId: "!a", name: "A", snr: 3.1, hop: 0, lat: -21, lon: 55, types: { position: 12, neighborinfo: 2 } },
    ]);
  });

  it("floute un mobile ; snr/hop/types null gérés", () => {
    const [r] = toNodeMapLinks([
      { nodeId: "!a", name: null, snr: null, hop: null, lat: -21.117, lon: 55.537, isMobile: true, types: null },
    ] as Rows);
    expect(r.lat).not.toBe(-21.117);
    expect(r.snr).toBeNull();
    expect(r.hop).toBeNull();
    expect(r.types).toEqual({});
  });
});

describe("getNodeMapLinks", () => {
  beforeEach(() => query.mockReset());

  it("interroge par node et normalise", async () => {
    query.mockResolvedValue({
      rows: [{ nodeId: "!a", name: "A", snr: 5, hop: 0, lat: -21, lon: 55, isMobile: false, types: { position: 1 } }],
    });
    const out = await getNodeMapLinks("!x");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["!x"]);
    expect(out[0].types).toEqual({ position: 1 });
  });
});
