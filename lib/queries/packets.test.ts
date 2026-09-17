import { beforeEach, describe, it, expect, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: { query } }));
import { getGatewayOverview, getRecentPackets, toGatewayStat } from "./packets";

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

describe("getGatewayOverview — recherche admin", () => {
  beforeEach(() => query.mockReset());

  it("recherche par nom ou NodeID avec une valeur normalisée", async () => {
    query.mockResolvedValue({ rows: [] });

    await getGatewayOverview("  piton  ");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      ["%piton%"],
    );
  });

  it("désactive le filtre quand la recherche est vide", async () => {
    query.mockResolvedValue({ rows: [] });

    await getGatewayOverview("   ");

    expect(query).toHaveBeenCalledWith(expect.any(String), [""]);
  });
});

// Aucun nom de canal en dur dans le SQL : ce qui est en base vient de l'allowlist
// (ingestion) ; un canal retiré se purge via /admin/config.
describe("getRecentPackets — pas de canal codé en dur", () => {
  beforeEach(() => query.mockReset());

  it("interroge sans filtre de canal nominatif", async () => {
    query.mockResolvedValue({ rows: [] });

    await getRecentPackets(50, null);

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toMatch(/Fr_/);
    expect(params).toEqual([50, null]);
  });
});
