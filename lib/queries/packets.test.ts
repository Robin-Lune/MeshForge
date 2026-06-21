import { describe, it, expect } from "vitest";
import { toGatewayStat } from "./packets";

describe("toGatewayStat — normalisation d'un agrégat gateway", () => {
  const row = {
    gatewayId: "!f669cf14",
    name: "Piton Gateway",
    packets24h: "1543", // COUNT(*) -> bigint string
    nodes24h: "37", // COUNT(DISTINCT) -> bigint string
    lastSeen: new Date("2026-06-21T10:00:00.000Z"),
  };

  it("coerce les COUNT bigint (string) en number", () => {
    const s = toGatewayStat(row);
    expect(s.packets24h).toBe(1543);
    expect(s.nodes24h).toBe(37);
  });

  it("formate lastSeen en ISO 8601, null si absent", () => {
    expect(toGatewayStat(row).lastSeen).toBe("2026-06-21T10:00:00.000Z");
    expect(toGatewayStat({ ...row, lastSeen: null }).lastSeen).toBeNull();
  });

  it("propage gatewayId et name (name nullable)", () => {
    expect(toGatewayStat(row).gatewayId).toBe("!f669cf14");
    expect(toGatewayStat({ ...row, name: null }).name).toBeNull();
  });
});
