import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect, clientQuery, release } = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const release = vi.fn();
  return {
    clientQuery,
    release,
    connect: vi.fn(async () => ({ query: clientQuery, release })),
  };
});
vi.mock("../db", () => ({ pool: { connect } }));

import { deleteNode } from "./nodes";

describe("deleteNode", () => {
  beforeEach(() => {
    clientQuery.mockReset();
    clientQuery.mockResolvedValue({});
    release.mockReset();
  });

  it("efface tous les rôles du node dans les quatre tables", async () => {
    await deleteNode("!gone");

    const sql = clientQuery.mock.calls.map(([statement]) => statement).join("\n");
    expect(clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(sql).toContain("node_id = $1 OR gateway_id = $1");
    expect(sql).toContain("node_id = $1 OR neighbor_id = $1 OR gateway_id = $1");
    expect(sql).toContain("source_node = $1");
    expect(sql).toContain("target_node = $1");
    expect(sql).toContain("from_node = $1");
    expect(sql).toContain("to_node = $1");
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM nodes"),
      ["!gone"],
    );
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rollback et relâche la connexion en cas d'échec", async () => {
    clientQuery.mockImplementation((sql: string) =>
      sql.includes("DELETE FROM packets")
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({}),
    );

    await expect(deleteNode("!gone")).rejects.toThrow("boom");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
