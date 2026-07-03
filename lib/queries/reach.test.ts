import { describe, it, expect, vi, beforeEach } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: { query } }));

import { toReachEdges, getNodeReach } from "./reach";

describe("toReachEdges", () => {
  it("coerce hop en number, conserve le sens from -> to", () => {
    expect(toReachEdges([{ fromId: "!a", toId: "!c", hop: "1" }])).toEqual([
      { fromId: "!a", toId: "!c", hop: 1 },
    ]);
  });
});

describe("getNodeReach", () => {
  beforeEach(() => query.mockReset());

  it("interroge et normalise", async () => {
    query.mockResolvedValue({ rows: [{ fromId: "!a", toId: "!c", hop: 1 }] });
    const out = await getNodeReach();
    expect(query).toHaveBeenCalledTimes(1);
    expect(out).toEqual([{ fromId: "!a", toId: "!c", hop: 1 }]);
  });
});
