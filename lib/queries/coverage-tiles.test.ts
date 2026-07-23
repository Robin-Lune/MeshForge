import { describe, it, expect } from "vitest";
import { assertTileZoom, cacheKey, toCoverageTiles } from "./coverage-tiles";
import {
  DEFAULT_COVERAGE_TILE_ZOOM,
  MAX_COVERAGE_TILE_ZOOM,
  MIN_COVERAGE_TILE_ZOOM,
} from "./settings";

type CoverageInputRow = Parameters<typeof toCoverageTiles>[0][number];

const row = (over: Partial<CoverageInputRow> = {}): CoverageInputRow => ({
  tx: 1,
  ty: 2,
  snrP90: -8.5,
  snrMax: -3,
  gateways: 2,
  nodes: 4,
  transmissions: 12,
  samples: 37,
  days: 5,
  ...over,
});

describe("toCoverageTiles", () => {
  it("normalise une ligne complète", () => {
    expect(toCoverageTiles([row()])).toEqual([
      {
        x: 1,
        y: 2,
        snrP90: -8.5,
        snrMax: -3,
        gateways: 2,
        nodes: 4,
        transmissions: 12,
        samples: 37,
        days: 5,
      },
    ]);
  });

  it("coerce les entiers rendus en string par pg (COUNT bigint)", () => {
    const [tile] = toCoverageTiles([
      row({
        tx: "10",
        ty: "20",
        gateways: "3",
        nodes: "9",
        transmissions: "120",
        samples: "512",
        days: "17",
      }),
    ]);
    expect(tile).toMatchObject({
      x: 10,
      y: 20,
      gateways: 3,
      nodes: 9,
      transmissions: 120,
      samples: 512,
      days: 17,
    });
  });

  it("préserve un SNR null sans le maquiller en 0 dB", () => {
    // 0 dB est un EXCELLENT signal : convertir null en 0 peindrait une tuile
    // sans mesure exploitable en vert vif.
    const [tile] = toCoverageTiles([row({ snrP90: null, snrMax: null })]);
    expect(tile.snrP90).toBeNull();
    expect(tile.snrMax).toBeNull();
  });

  it("préserve un SNR négatif et l'indice 0", () => {
    const [tile] = toCoverageTiles([
      row({ tx: 0, ty: 0, snrP90: -19.75 }),
    ]);
    expect(tile.x).toBe(0);
    expect(tile.y).toBe(0);
    expect(tile.snrP90).toBe(-19.75);
  });

  it("retourne un tableau vide sans ligne", () => {
    expect(toCoverageTiles([])).toEqual([]);
  });
});

// Le zoom alimente un exposant dans le SQL (2^z) : on refuse tout ce qui n'est
// pas un entier de la plage, même si la valeur vient de la table settings.
describe("assertTileZoom — défense en profondeur", () => {
  it("laisse passer la plage autorisée", () => {
    for (let z = MIN_COVERAGE_TILE_ZOOM; z <= MAX_COVERAGE_TILE_ZOOM; z++) {
      expect(assertTileZoom(z)).toBe(z);
    }
  });

  it("accepte le défaut", () => {
    expect(assertTileZoom(DEFAULT_COVERAGE_TILE_ZOOM)).toBe(
      DEFAULT_COVERAGE_TILE_ZOOM,
    );
  });

  it("jette hors plage, sur un décimal ou sur NaN", () => {
    expect(() => assertTileZoom(MIN_COVERAGE_TILE_ZOOM - 1)).toThrow();
    expect(() => assertTileZoom(MAX_COVERAGE_TILE_ZOOM + 1)).toThrow();
    expect(() => assertTileZoom(22)).toThrow();
    expect(() => assertTileZoom(15.5)).toThrow();
    expect(() => assertTileZoom(Number.NaN)).toThrow();
  });
});

// La clé de cache doit couvrir TOUTES les entrées de la requête. Un oubli des
// bornes servait l'ancien découpage pendant 10 minutes après un élargissement
// en admin : le territoire nouvellement inclus s'affichait « non exploré »
// alors que les paquets existaient.
describe("cacheKey", () => {
  const bornes = { west: 54.7, south: -21.9, east: 56.3, north: -20.4 };

  it("distingue deux zooms", () => {
    expect(cacheKey(15, bornes)).not.toBe(cacheKey(14, bornes));
  });

  it("distingue deux jeux de bornes à zoom égal", () => {
    expect(cacheKey(15, bornes)).not.toBe(
      cacheKey(15, { ...bornes, east: 57 }),
    );
  });

  it("distingue chacune des quatre bornes", () => {
    for (const cote of ["west", "south", "east", "north"] as const) {
      expect(cacheKey(15, bornes)).not.toBe(
        cacheKey(15, { ...bornes, [cote]: bornes[cote] + 1 }),
      );
    }
  });

  it("distingue une carte ouverte d'une carte bornée", () => {
    expect(cacheKey(15, null)).not.toBe(cacheKey(15, bornes));
  });

  it("distingue les canaux publics et le mode démo", () => {
    expect(cacheKey(15, bornes, ["Fr_Balise"])).not.toBe(
      cacheKey(15, bornes, ["Fr_BlaBla"]),
    );
    expect(cacheKey(15, bornes, ["Fr_Balise"], false)).not.toBe(
      cacheKey(15, bornes, ["Fr_Balise"], true),
    );
  });

  it("est indépendante de l'ordre des canaux", () => {
    expect(cacheKey(15, bornes, ["B", "A"])).toBe(
      cacheKey(15, bornes, ["A", "B"]),
    );
  });

  it("est stable pour des entrées identiques", () => {
    expect(cacheKey(15, { ...bornes })).toBe(cacheKey(15, { ...bornes }));
    expect(cacheKey(15, null)).toBe(cacheKey(15, null));
  });
});
