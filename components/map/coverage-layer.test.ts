import { describe, it, expect } from "vitest";
import { tileFillColor, toCoverageGeoJSON } from "./coverage-layer";
import {
  SNR_BAD,
  SNR_FAIR,
  SNR_GOOD,
  SNR_UNKNOWN_COLOR,
} from "./signal-color";
import { tileToBounds } from "@/lib/tiles";
import type { CoverageTile } from "@/types";

const tile = (over: Partial<CoverageTile> = {}): CoverageTile => ({
  x: 21431,
  y: 18327,
  snrP90: -5,
  snrMax: -3,
  gateways: 2,
  nodes: 3,
  transmissions: 8,
  samples: 12,
  days: 4,
  ...over,
});

describe("tileFillColor — métrique SNR", () => {
  it("suit le barème Meshtastic sur le p90", () => {
    expect(tileFillColor(tile({ snrP90: -5 }), "snr")).toBe(SNR_GOOD);
    expect(tileFillColor(tile({ snrP90: -10 }), "snr")).toBe(SNR_FAIR);
    expect(tileFillColor(tile({ snrP90: -18 }), "snr")).toBe(SNR_BAD);
  });

  it("colore le p90 et NON le max", () => {
    // Une tuile au max flatteur (-3, propagation exceptionnelle) mais au p90
    // médiocre doit rester peinte selon le p90 : la couche décrit la couverture
    // atteignable, pas le coup de chance.
    expect(tileFillColor(tile({ snrP90: -18, snrMax: -3 }), "snr")).toBe(SNR_BAD);
  });

  it("rend la couleur « inconnu » quand aucun SNR n'est exploitable", () => {
    expect(tileFillColor(tile({ snrP90: null }), "snr")).toBe(SNR_UNKNOWN_COLOR);
  });

  it("ignore le RSSI (non comparable entre gateways)", () => {
    // Garde-fou : si un jour on passait un RSSI à signalColor, une tuile au bon
    // SNR pourrait être rétrogradée par le plancher de bruit d'UNE gateway.
    expect(tileFillColor(tile({ snrP90: -5 }), "snr")).toBe(SNR_GOOD);
  });
});

describe("tileFillColor — métriques de comptage", () => {
  it("échelonne la redondance : 1 relais fragile, 3+ résilient", () => {
    expect(tileFillColor(tile({ gateways: 1 }), "gateways")).toBe(SNR_BAD);
    expect(tileFillColor(tile({ gateways: 2 }), "gateways")).toBe(SNR_FAIR);
    expect(tileFillColor(tile({ gateways: 3 }), "gateways")).toBe(SNR_GOOD);
    expect(tileFillColor(tile({ gateways: 12 }), "gateways")).toBe(SNR_GOOD);
  });

  it("distingue une sonde unique de plusieurs émetteurs", () => {
    expect(tileFillColor(tile({ nodes: 1 }), "nodes")).toBe(SNR_BAD);
    expect(tileFillColor(tile({ nodes: 2 }), "nodes")).toBe(SNR_FAIR);
    expect(tileFillColor(tile({ nodes: 3 }), "nodes")).toBe(SNR_GOOD);
  });

  it("ne dépend pas du SNR pour une métrique de comptage", () => {
    expect(tileFillColor(tile({ snrP90: null, gateways: 3 }), "gateways")).toBe(
      SNR_GOOD,
    );
  });
});

describe("toCoverageGeoJSON", () => {
  const z = 15;

  it("produit un polygone par tuile, aligné sur la maille", () => {
    const fc = toCoverageGeoJSON([tile()], z, "snr");
    expect(fc.features).toHaveLength(1);
    const ring = fc.features[0].geometry.coordinates[0];
    const b = tileToBounds(21431, 18327, z);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual([b.west, b.north]);
    expect(ring[4]).toEqual(ring[0]); // anneau fermé
  });

  it("porte une couleur pré-calculée pour chaque métrique", () => {
    for (const metric of ["snr", "gateways", "nodes"] as const) {
      const fc = toCoverageGeoJSON([tile()], z, metric);
      expect(fc.features[0].properties.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("recolore sans changer la géométrie quand la métrique change", () => {
    // Invariant du design : changer de métrique = un simple setData, le paint
    // MapLibre reste ["get","color"].
    const low = toCoverageGeoJSON([tile({ snrP90: -18, gateways: 3 })], z, "snr");
    const high = toCoverageGeoJSON(
      [tile({ snrP90: -18, gateways: 3 })],
      z,
      "gateways",
    );
    expect(low.features[0].geometry).toEqual(high.features[0].geometry);
    expect(low.features[0].properties.color).not.toBe(
      high.features[0].properties.color,
    );
  });

  it("conserve les stats brutes pour l'infobulle", () => {
    const fc = toCoverageGeoJSON([tile()], z, "snr");
    expect(fc.features[0].properties).toMatchObject({
      snrP90: -5,
      snrMax: -3,
      gateways: 2,
      nodes: 3,
      transmissions: 8,
      samples: 12,
      days: 4,
    });
  });

  it("porte les indices de tuile, qui servent d'identité au survol", () => {
    // Sans (x,y) dans les propriétés, le contrôleur ne peut pas détecter un
    // changement de tuile et reconstruit l'infobulle à chaque mousemove.
    const fc = toCoverageGeoJSON([tile({ x: 42, y: 7 })], z, "snr");
    expect(fc.features[0].properties).toMatchObject({ x: 42, y: 7 });
  });

  it("donne des identités distinctes à deux tuiles voisines", () => {
    const fc = toCoverageGeoJSON(
      [tile({ x: 10, y: 20 }), tile({ x: 11, y: 20 })],
      z,
      "snr",
    );
    const cle = (i: number) =>
      `${fc.features[i].properties.x}/${fc.features[i].properties.y}`;
    expect(cle(0)).not.toBe(cle(1));
  });

  it("rend une collection vide sans tuile (aucune donnée ≠ mauvaise couverture)", () => {
    const fc = toCoverageGeoJSON([], z, "snr");
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([]);
  });
});
