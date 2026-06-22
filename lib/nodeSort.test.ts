import { describe, it, expect } from "vitest";
import { sortNodeList } from "./nodeSort";
import type { NodeListItem } from "../types";

// Fabrique une ligne minimale ; on ne renseigne que les champs utiles au tri.
function node(p: Partial<NodeListItem>): NodeListItem {
  return {
    nodeId: "!00",
    longName: null,
    shortName: null,
    hwModel: null,
    role: null,
    batteryPct: null,
    lastSeen: null,
    isMobile: true,
    isGateway: false,
    active: false,
    packets24h: 0,
    misconfig: [],
    ...p,
  };
}

const ids = (rows: NodeListItem[]) => rows.map((n) => n.nodeId);

describe("sortNodeList — tri client de la liste des nodes", () => {
  it("batteryPct ascendant, valeurs inconnues (null) en dernier", () => {
    const items = [
      node({ nodeId: "a", batteryPct: 50 }),
      node({ nodeId: "b", batteryPct: null }),
      node({ nodeId: "c", batteryPct: 10 }),
    ];
    expect(ids(sortNodeList(items, "batteryPct", "asc"))).toEqual(["c", "a", "b"]);
  });

  it("batteryPct descendant — les null restent en dernier malgré le sens", () => {
    const items = [
      node({ nodeId: "a", batteryPct: 50 }),
      node({ nodeId: "b", batteryPct: null }),
      node({ nodeId: "c", batteryPct: 10 }),
    ];
    expect(ids(sortNodeList(items, "batteryPct", "desc"))).toEqual(["a", "c", "b"]);
  });

  it("nom : longName d'abord, insensible à la casse", () => {
    const items = [
      node({ nodeId: "a", longName: "zeta" }),
      node({ nodeId: "b", longName: "Alpha" }),
      node({ nodeId: "c", shortName: "Mike" }),
    ];
    expect(ids(sortNodeList(items, "name", "asc"))).toEqual(["b", "c", "a"]);
  });

  it("nom : retombe sur shortName puis nodeId si pas de longName", () => {
    const items = [
      node({ nodeId: "zzzz" }), // pas de nom → trié sur le nodeId
      node({ nodeId: "x", shortName: "AAA" }), // trié sur le shortName
    ];
    expect(ids(sortNodeList(items, "name", "asc"))).toEqual(["x", "zzzz"]);
  });

  it("lastSeen descendant : plus récent d'abord, jamais-vu en dernier", () => {
    const items = [
      node({ nodeId: "a", lastSeen: "2026-06-20T10:00:00.000Z" }),
      node({ nodeId: "b", lastSeen: null }),
      node({ nodeId: "c", lastSeen: "2026-06-22T10:00:00.000Z" }),
    ];
    expect(ids(sortNodeList(items, "lastSeen", "desc"))).toEqual(["c", "a", "b"]);
  });

  it("role : null en dernier, tri alpha sinon", () => {
    const items = [
      node({ nodeId: "a", role: null }),
      node({ nodeId: "b", role: "ROUTER" }),
      node({ nodeId: "c", role: "CLIENT" }),
    ];
    expect(ids(sortNodeList(items, "role", "asc"))).toEqual(["c", "b", "a"]);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const items = [
      node({ nodeId: "a", batteryPct: 50 }),
      node({ nodeId: "b", batteryPct: 10 }),
    ];
    const before = ids(items);
    sortNodeList(items, "batteryPct", "asc");
    expect(ids(items)).toEqual(before);
  });
});
