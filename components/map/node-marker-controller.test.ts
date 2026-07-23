import { describe, expect, it } from "vitest";
import { matchesHopFilter } from "./node-marker-controller";

describe("matchesHopFilter", () => {
  it("accepte tous les hops avec le filtre global", () => {
    expect(matchesHopFilter(undefined, "all")).toBe(true);
    expect(matchesHopFilter(4, "all")).toBe(true);
  });

  it("refuse une observation sans hop pour un filtre précis", () => {
    expect(matchesHopFilter(undefined, "0")).toBe(false);
    expect(matchesHopFilter(undefined, "3plus")).toBe(false);
  });

  it("distingue les hops exacts du palier trois et plus", () => {
    expect(matchesHopFilter(0, "0")).toBe(true);
    expect(matchesHopFilter(1, "1")).toBe(true);
    expect(matchesHopFilter(2, "1")).toBe(false);
    expect(matchesHopFilter(2, "3plus")).toBe(false);
    expect(matchesHopFilter(3, "3plus")).toBe(true);
    expect(matchesHopFilter(7, "3plus")).toBe(true);
  });
});
