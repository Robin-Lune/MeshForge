import { describe, it, expect } from "vitest";
import { assertTileZoom, toCoverageTiles } from "./coverage-tiles";
import {
  DEFAULT_COVERAGE_TILE_ZOOM,
  MAX_COVERAGE_TILE_ZOOM,
  MIN_COVERAGE_TILE_ZOOM,
} from "./settings";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  tx: 1,
  ty: 2,
  snrP90: -8.5,
  snrMax: -3,
  gateways: 2,
  nodes: 4,
  samples: 37,
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
        samples: 37,
      },
    ]);
  });

  it("coerce les entiers rendus en string par pg (COUNT bigint)", () => {
    const [tile] = toCoverageTiles([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row({ tx: "10", ty: "20", gateways: "3", nodes: "9", samples: "512" }) as any,
    ]);
    expect(tile).toMatchObject({
      x: 10,
      y: 20,
      gateways: 3,
      nodes: 9,
      samples: 512,
    });
  });

  it("préserve un SNR null sans le maquiller en 0 dB", () => {
    // 0 dB est un EXCELLENT signal : convertir null en 0 peindrait une tuile
    // sans mesure exploitable en vert vif.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tile] = toCoverageTiles([row({ snrP90: null, snrMax: null }) as any]);
    expect(tile.snrP90).toBeNull();
    expect(tile.snrMax).toBeNull();
  });

  it("préserve un SNR négatif et l'indice 0", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tile] = toCoverageTiles([row({ tx: 0, ty: 0, snrP90: -19.75 }) as any]);
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
