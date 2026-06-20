import { describe, it, expect } from "vitest";
import { parseNotification } from "./realtime";

// Payload tel que produit par pg_notify('node_update', ...) côté worker.
const valid = JSON.stringify({
  nodeId: "!f669cf14",
  longName: "Piton",
  shortName: "PIT",
  lat: -21.1,
  lon: 55.5,
  batteryPct: 80,
  lastSeen: "2026-06-20T10:00:00.000Z",
});

describe("parseNotification — payload NOTIFY 'node_update'", () => {
  it("parse un payload valide", () => {
    const u = parseNotification(valid);
    expect(u?.nodeId).toBe("!f669cf14");
    expect(u?.lat).toBe(-21.1);
    expect(u?.batteryPct).toBe(80);
    expect(u?.lastSeen).toBe("2026-06-20T10:00:00.000Z");
  });

  it("renvoie null sur JSON malformé", () => {
    expect(parseNotification("{pas du json")).toBeNull();
  });

  it("renvoie null sans nodeId", () => {
    expect(parseNotification(JSON.stringify({ lat: -21, lon: 55 }))).toBeNull();
  });

  it("renvoie null sans coordonnées numériques", () => {
    expect(parseNotification(JSON.stringify({ nodeId: "!x", lat: "a", lon: "b" }))).toBeNull();
  });

  it("tolère les champs optionnels absents (mis à null)", () => {
    const u = parseNotification(JSON.stringify({ nodeId: "!x", lat: -21, lon: 55 }));
    expect(u?.longName).toBeNull();
    expect(u?.batteryPct).toBeNull();
    expect(u?.lastSeen).toBeNull();
  });
});
