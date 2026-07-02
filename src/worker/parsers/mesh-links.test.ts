import { describe, it, expect } from "vitest";
import { traceroutePathEndpoints } from "./mesh-links";

// Extrémités logiques A↔D d'un traceroute (réponse complète uniquement).
describe("traceroutePathEndpoints", () => {
  it("réponse valide -> origine (to), destination (from), sauts = route+1", () => {
    expect(
      traceroutePathEndpoints({
        from: 0xf669cf14,
        to: 0x0a0a0a0a,
        routeLen: 2,
        isRequest: false,
      }),
    ).toEqual({ aId: "!0a0a0a0a", bId: "!f669cf14", hops: 3 });
  });

  it("requête en vol (isRequest true) -> null", () => {
    expect(
      traceroutePathEndpoints({ from: 1, to: 2, routeLen: 1, isRequest: true }),
    ).toBeNull();
  });

  it("sens inconnu (undefined) -> null", () => {
    expect(
      traceroutePathEndpoints({ from: 1, to: 2, routeLen: 1, isRequest: undefined }),
    ).toBeNull();
  });

  it("destination broadcast -> null", () => {
    expect(
      traceroutePathEndpoints({
        from: 0xf669cf14,
        to: 0xffffffff,
        routeLen: 1,
        isRequest: false,
      }),
    ).toBeNull();
  });

  it("to === from -> null", () => {
    expect(
      traceroutePathEndpoints({ from: 5, to: 5, routeLen: 1, isRequest: false }),
    ).toBeNull();
  });

  it("to absent (null) -> null", () => {
    expect(
      traceroutePathEndpoints({ from: 5, to: null, routeLen: 1, isRequest: false }),
    ).toBeNull();
  });
});
