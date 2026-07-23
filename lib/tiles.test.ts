import { describe, it, expect } from "vitest";
import { haversineKm } from "./geo";
import {
  MAX_MERCATOR_LAT,
  lonLatToTile,
  meshtasticPrecisionHalfSpan,
  positionUncertaintyFitsTile,
  tileCount,
  tileToBounds,
  tileToRing,
} from "./tiles";

// Point de référence : St-Denis de La Réunion.
const REUNION_LAT = -20.8789;
const REUNION_LON = 55.4481;

describe("lonLatToTile", () => {
  it("place l'origine (0,0) au coin haut-gauche du quadrant sud-est", () => {
    // Convention XYZ : lon 0 -> moitié de la grille, lat 0 -> moitié aussi.
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it("place l'antiméridien nord-ouest en (0,0)", () => {
    expect(lonLatToTile(-180, MAX_MERCATOR_LAT, 4)).toEqual({ x: 0, y: 0 });
  });

  it("borne les indices dans la grille pour une latitude polaire", () => {
    const n = tileCount(5);
    expect(lonLatToTile(179.9, -89.9, 5)).toEqual({ x: n - 1, y: n - 1 });
  });

  it("borne aussi une longitude à la limite haute", () => {
    const n = tileCount(5);
    // lon = 180 tomberait sur l'index n (hors grille) sans le clamp.
    expect(lonLatToTile(180, 0, 5).x).toBe(n - 1);
  });

  it("est cohérent avec tileToBounds (le point retombe dans sa tuile)", () => {
    const z = 15;
    const { x, y } = lonLatToTile(REUNION_LON, REUNION_LAT, z);
    const b = tileToBounds(x, y, z);
    expect(REUNION_LON).toBeGreaterThanOrEqual(b.west);
    expect(REUNION_LON).toBeLessThan(b.east);
    expect(REUNION_LAT).toBeLessThanOrEqual(b.north);
    expect(REUNION_LAT).toBeGreaterThan(b.south);
  });

  it("range deux points distants de La Réunion dans des tuiles différentes", () => {
    const z = 15;
    const stDenis = lonLatToTile(55.4481, -20.8789, z);
    const stPierre = lonLatToTile(55.4781, -21.3393, z);
    expect(stDenis).not.toEqual(stPierre);
  });
});

describe("précision Meshtastic", () => {
  it("reproduit la demi-largeur du masque binaire du firmware", () => {
    expect(meshtasticPrecisionHalfSpan(14)).toBe(0.0131072);
    expect(meshtasticPrecisionHalfSpan(16)).toBe(0.0032768);
    expect(meshtasticPrecisionHalfSpan(32)).toBe(0);
  });

  it("refuse les précisions absentes ou ambiguës", () => {
    expect(meshtasticPrecisionHalfSpan(0)).toBeNull();
    expect(meshtasticPrecisionHalfSpan(14.5)).toBeNull();
    expect(meshtasticPrecisionHalfSpan(33)).toBeNull();
  });

  it("n'assimile pas precision_bits au zoom de la tuile", () => {
    const z = 15;
    const { x, y } = lonLatToTile(REUNION_LON, REUNION_LAT, z);
    const b = tileToBounds(x, y, z);
    const lon = (b.west + b.east) / 2;
    const lat = (b.south + b.north) / 2;

    expect(positionUncertaintyFitsTile(lon, lat, 32, z)).toBe(true);
    expect(positionUncertaintyFitsTile(lon, lat, 16, z)).toBe(true);
    expect(positionUncertaintyFitsTile(lon, lat, 15, z)).toBe(false);
  });

  it("rejette une position pourtant fine quand son incertitude traverse un bord", () => {
    const z = 15;
    const { x, y } = lonLatToTile(REUNION_LON, REUNION_LAT, z);
    const b = tileToBounds(x, y, z);
    const lat = (b.south + b.north) / 2;
    expect(positionUncertaintyFitsTile(b.west + 0.0001, lat, 16, z)).toBe(
      false,
    );
  });
});

describe("tileToBounds", () => {
  it("couvre le monde entier au zoom 0", () => {
    const b = tileToBounds(0, 0, 0);
    expect(b.west).toBe(-180);
    expect(b.east).toBe(180);
    // MAX_MERCATOR_LAT est la valeur arrondie de la limite : on compare à
    // la précision de la constante, pas au bit près.
    expect(b.north).toBeCloseTo(MAX_MERCATOR_LAT, 7);
    expect(b.south).toBeCloseTo(-MAX_MERCATOR_LAT, 7);
  });

  it("oriente y vers le sud (north > south)", () => {
    const b = tileToBounds(1, 1, 2);
    expect(b.north).toBeGreaterThan(b.south);
    expect(b.east).toBeGreaterThan(b.west);
  });

  it("est jointif : le bord est d'une tuile est le bord ouest de la suivante", () => {
    const z = 15;
    const a = tileToBounds(100, 200, z);
    const right = tileToBounds(101, 200, z);
    const below = tileToBounds(100, 201, z);
    expect(right.west).toBeCloseTo(a.east, 12);
    expect(below.north).toBeCloseTo(a.south, 12);
  });
});

// La taille de maille est LE paramètre de conception de la couche (arbitrage
// relief de l'île / densité de données). On la verrouille par un test.
describe("taille de maille à la latitude de La Réunion", () => {
  const sideKm = (z: number): number => {
    const { x, y } = lonLatToTile(REUNION_LON, REUNION_LAT, z);
    const b = tileToBounds(x, y, z);
    const midLat = (b.north + b.south) / 2;
    return haversineKm(midLat, b.west, midLat, b.east);
  };

  it.each([
    [13, 4.6],
    [14, 2.3],
    [15, 1.15],
    [16, 0.57],
  ])("z%i ≈ %f km de côté", (z, expected) => {
    expect(sideKm(z)).toBeCloseTo(expected, 1);
  });

  it("z15 (défaut) reste plus grossier que le flou de 500 m des marqueurs", () => {
    // Invariant privacy : la maille par défaut ne doit pas exposer une
    // granularité plus fine que snapToGrid (~0,5 km, cf. lib/privacy.ts).
    expect(sideKm(15)).toBeGreaterThan(0.5);
  });
});

describe("tileToRing", () => {
  it("produit un anneau fermé de 5 points", () => {
    const ring = tileToRing(10, 20, 15);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it("suit les bords de la tuile", () => {
    const b = tileToBounds(10, 20, 15);
    const ring = tileToRing(10, 20, 15);
    expect(ring[0]).toEqual([b.west, b.north]);
    expect(ring[2]).toEqual([b.east, b.south]);
  });
});
