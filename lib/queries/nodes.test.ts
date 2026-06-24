import { describe, expect, it } from "vitest";
import { resolveGatewayStatus, shouldUpsertGatewayNode } from "./nodes";

describe("resolveGatewayStatus", () => {
  it("suit l'auto-détection quand l'override est null", () => {
    expect(resolveGatewayStatus(null, true)).toBe(true);
    expect(resolveGatewayStatus(null, false)).toBe(false);
  });

  it("force le statut gateway quand l'admin pose un override", () => {
    expect(resolveGatewayStatus(true, false)).toBe(true);
    expect(resolveGatewayStatus(false, true)).toBe(false);
  });
});

describe("shouldUpsertGatewayNode", () => {
  it("recense une gateway différente du node émetteur", () => {
    expect(shouldUpsertGatewayNode("!gw", "!node")).toBe(true);
  });

  it("ignore les paquets sans gateway ou publiés par le même node", () => {
    expect(shouldUpsertGatewayNode(null, "!node")).toBe(false);
    expect(shouldUpsertGatewayNode("!node", "!node")).toBe(false);
  });
});
