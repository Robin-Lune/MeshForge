import { describe, it, expect } from "vitest";
import {
  lerp,
  lineFeature,
  nodeFeature,
  shortLabel,
} from "@/components/map/map-data";
import type { MarkerNode } from "@/components/map/map-data";

const base: MarkerNode = {
  nodeId: "!a1b2c3d4",
  longName: "Saint-Denis",
  shortName: "StD",
  lat: -20.88,
  lon: 55.45,
  batteryPct: 90,
  lastSeen: "2026-07-31T12:00:00Z",
};

describe("shortLabel", () => {
  it("préfère le nom court", () => {
    expect(shortLabel("!a1b2c3d4", "StD")).toBe("StD");
  });

  it("retombe sur les 4 derniers caractères du NodeID", () => {
    expect(shortLabel("!a1b2c3d4", null)).toBe("c3d4");
    expect(shortLabel("!a1b2c3d4", undefined)).toBe("c3d4");
    expect(shortLabel("!a1b2c3d4", "   ")).toBe("c3d4");
  });
});

describe("nodeFeature", () => {
  it("porte les propriétés nécessaires au rendu du marker", () => {
    const p = nodeFeature(base).properties as Record<string, unknown>;
    expect(p.nodeId).toBe("!a1b2c3d4");
    expect(p.label).toBe("StD");
    expect(p.lastSeen).toBe("2026-07-31T12:00:00Z");
    expect(p.isGateway).toBe(false);
    expect(p.isMobile).toBe(false);
  });

  it("NE FIGE PAS de couleur dans le feature", () => {
    // La couleur dépend du temps qui passe, pas de la donnée : la calculer ici
    // la rendrait fausse dès la minute suivante. Elle est produite au rendu et
    // repeinte par applyFreshness().
    const p = nodeFeature(base).properties as Record<string, unknown>;
    expect(p).not.toHaveProperty("color");
  });

  it("normalise les champs absents", () => {
    const p = nodeFeature({
      ...base,
      longName: null,
      shortName: null,
      lastSeen: null,
      role: null,
    }).properties as Record<string, unknown>;
    expect(p.longName).toBe("");
    expect(p.lastSeen).toBe("");
    expect(p.role).toBe("");
    expect(p.lastSnr).toBeNull();
  });

  it("propage gateway, mobilité et rôle", () => {
    const p = nodeFeature({
      ...base,
      isGateway: true,
      isMobile: true,
      role: "ROUTER",
      lastSnr: -7.5,
    }).properties as Record<string, unknown>;
    expect(p.isGateway).toBe(true);
    expect(p.isMobile).toBe(true);
    expect(p.role).toBe("ROUTER");
    expect(p.lastSnr).toBe(-7.5);
  });

  it("place le point en [lon, lat]", () => {
    const g = nodeFeature(base).geometry as GeoJSON.Point;
    expect(g.coordinates).toEqual([55.45, -20.88]);
  });
});

describe("lerp / lineFeature", () => {
  it("interpole entre deux points", () => {
    expect(lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    expect(lerp([0, 0], [10, 20], 0)).toEqual([0, 0]);
    expect(lerp([0, 0], [10, 20], 1)).toEqual([10, 20]);
  });

  it("construit un segment portant son nombre de hops", () => {
    const f = lineFeature([1, 2], [3, 4], 2);
    expect(f.properties).toEqual({ hop: 2 });
    expect((f.geometry as GeoJSON.LineString).coordinates).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});
