import { describe, it, expect } from "vitest";
import { toTraceroutePaths } from "./traceroute-paths";

describe("toTraceroutePaths — trajets logiques A↔D", () => {
  it("coerce hops en number", () => {
    expect(
      toTraceroutePaths([{ aId: "!a", bId: "!d", hops: "3" }]),
    ).toEqual([{ aId: "!a", bId: "!d", hops: 3 }]);
  });

  it("préserve hops null", () => {
    expect(toTraceroutePaths([{ aId: "!a", bId: "!d", hops: null }])[0].hops).toBeNull();
  });
});
