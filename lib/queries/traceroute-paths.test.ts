import { describe, it, expect, vi, beforeEach } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: { query } }));

import {
  toTraceroutePaths,
  getTraceroutePaths,
  insertTraceroutePath,
} from "./traceroute-paths";

describe("toTraceroutePaths — trajets logiques A↔D", () => {
  it("coerce hops en number", () => {
    expect(toTraceroutePaths([{ aId: "!a", bId: "!d", hops: "3" }])).toEqual([
      { aId: "!a", bId: "!d", hops: 3 },
    ]);
  });

  it("préserve hops null", () => {
    expect(toTraceroutePaths([{ aId: "!a", bId: "!d", hops: null }])[0].hops).toBeNull();
  });
});

describe("insertTraceroutePath", () => {
  beforeEach(() => query.mockReset());

  it("insère la paire (normalisée par la requête) + sauts", async () => {
    query.mockResolvedValue({});
    await insertTraceroutePath("!a", "!d", 3);
    expect(query).toHaveBeenCalledWith(expect.any(String), ["!a", "!d", 3]);
  });
});

describe("getTraceroutePaths", () => {
  beforeEach(() => query.mockReset());

  it("passe la fenêtre en paramètre et normalise les lignes", async () => {
    query.mockResolvedValue({ rows: [{ aId: "!a", bId: "!d", hops: "2" }] });
    const paths = await getTraceroutePaths(168);
    expect(query).toHaveBeenCalledWith(expect.any(String), [168]);
    expect(paths).toEqual([{ aId: "!a", bId: "!d", hops: 2 }]);
  });
});
