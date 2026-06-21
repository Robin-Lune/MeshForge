import { describe, it, expect } from "vitest";
import {
  classifyMisconfig,
  toNodeListItem,
  LOW_BATTERY_THRESHOLD,
} from "./node-lists";

// Seuil « bavard » injecté explicitement (en prod il vient de la config DB).
const MAX = 1000;

// Un node sain : nodeinfo + position OK, batterie correcte, peu bavard.
const healthy = {
  hasNodeinfo: true,
  hasPosition: true,
  batteryPct: 80,
  packets24h: 50,
};

describe("classifyMisconfig — critères « mal configuré »", () => {
  it("ne renvoie aucune raison pour un node sain", () => {
    expect(classifyMisconfig(healthy, MAX)).toEqual([]);
  });

  it("flag no-nodeinfo si long_name absent (hasNodeinfo=false)", () => {
    expect(classifyMisconfig({ ...healthy, hasNodeinfo: false }, MAX)).toEqual([
      "no-nodeinfo",
    ]);
  });

  it("flag no-position si jamais de position", () => {
    expect(classifyMisconfig({ ...healthy, hasPosition: false }, MAX)).toEqual([
      "no-position",
    ]);
  });

  it("flag low-battery sous le seuil, pas au seuil", () => {
    expect(
      classifyMisconfig({ ...healthy, batteryPct: LOW_BATTERY_THRESHOLD - 1 }, MAX),
    ).toEqual(["low-battery"]);
    expect(
      classifyMisconfig({ ...healthy, batteryPct: LOW_BATTERY_THRESHOLD }, MAX),
    ).toEqual([]);
  });

  it("ignore la batterie inconnue (null) — pas un défaut de config", () => {
    expect(classifyMisconfig({ ...healthy, batteryPct: null }, MAX)).toEqual([]);
  });

  it("flag too-chatty au-dessus du seuil de transmissions, pas au seuil", () => {
    expect(classifyMisconfig({ ...healthy, packets24h: MAX + 1 }, MAX)).toEqual([
      "too-chatty",
    ]);
    expect(classifyMisconfig({ ...healthy, packets24h: MAX }, MAX)).toEqual([]);
  });

  it("cumule les raisons dans un ordre stable", () => {
    expect(
      classifyMisconfig(
        {
          hasNodeinfo: false,
          hasPosition: false,
          batteryPct: 5,
          packets24h: MAX + 100,
        },
        MAX,
      ),
    ).toEqual(["no-nodeinfo", "no-position", "low-battery", "too-chatty"]);
  });

  it("respecte un seuil de transmissions custom", () => {
    expect(classifyMisconfig({ ...healthy, packets24h: 200 }, 100)).toEqual([
      "too-chatty",
    ]);
  });
});

describe("toNodeListItem — normalisation d'une ligne DB", () => {
  const row = {
    nodeId: "!a1b2c3d4",
    longName: "Relais Piton",
    shortName: "PIT",
    hwModel: "HELTEC_V4",
    role: "ROUTER",
    batteryPct: 90,
    lastSeen: new Date("2026-06-21T10:00:00.000Z"),
    isMobile: false,
    isGateway: true,
    active: true,
    hasNodeinfo: true,
    hasPosition: true,
    packets24h: "42", // COUNT(DISTINCT) -> bigint sérialisé en string par pg
  };

  it("coerce le COUNT bigint (string) en number", () => {
    expect(toNodeListItem(row, MAX).packets24h).toBe(42);
  });

  it("formate lastSeen en ISO 8601, null si jamais vu", () => {
    expect(toNodeListItem(row, MAX).lastSeen).toBe("2026-06-21T10:00:00.000Z");
    expect(toNodeListItem({ ...row, lastSeen: null }, MAX).lastSeen).toBeNull();
  });

  it("calcule misconfig à partir de la ligne (chatty si > seuil)", () => {
    expect(toNodeListItem(row, MAX).misconfig).toEqual([]);
    const chatty = { ...row, packets24h: String(MAX + 1) };
    expect(toNodeListItem(chatty, MAX).misconfig).toEqual(["too-chatty"]);
  });

  it("propage les champs d'affichage tels quels", () => {
    const item = toNodeListItem(row, MAX);
    expect(item.nodeId).toBe("!a1b2c3d4");
    expect(item.isGateway).toBe(true);
    expect(item.active).toBe(true);
  });
});
