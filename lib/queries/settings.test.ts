import { describe, it, expect } from "vitest";
import {
  parsePositiveInt,
  requirePositiveInt,
  parseChannelList,
  requireChannelList,
  parseMapBounds,
  requireMapBounds,
  parseZoom,
  requireZoom,
} from "./settings";

// Lecture tolérante d'une valeur stockée (JSONB) : invalide -> fallback.
describe("parsePositiveInt — lecture tolérante", () => {
  it("accepte un number direct (JSONB) ou une string numérique", () => {
    expect(parsePositiveInt(2500, 1000)).toBe(2500);
    expect(parsePositiveInt("2500", 1000)).toBe(2500);
  });

  it("retombe sur le fallback si absent / non numérique / <=0 / décimal", () => {
    expect(parsePositiveInt(undefined, 1000)).toBe(1000);
    expect(parsePositiveInt(null, 1000)).toBe(1000);
    expect(parsePositiveInt("abc", 1000)).toBe(1000);
    expect(parsePositiveInt(0, 1000)).toBe(1000);
    expect(parsePositiveInt(-5, 1000)).toBe(1000);
    expect(parsePositiveInt(12.5, 1000)).toBe(1000);
  });
});

// Validation STRICTE à l'écriture (page admin) : une entrée invalide est
// REFUSÉE (jette), jamais silencieusement remplacée par un défaut.
describe("requirePositiveInt — validation écriture", () => {
  it("retourne la valeur pour un entier > 0", () => {
    expect(requirePositiveInt(2500)).toBe(2500);
    expect(requirePositiveInt("2500")).toBe(2500);
  });

  it("jette pour 0, négatif, décimal, NaN ou non numérique", () => {
    expect(() => requirePositiveInt(0)).toThrow();
    expect(() => requirePositiveInt(-1)).toThrow();
    expect(() => requirePositiveInt(12.5)).toThrow();
    expect(() => requirePositiveInt("abc")).toThrow();
    expect(() => requirePositiveInt(undefined)).toThrow();
  });
});

const FALLBACK_CHANNELS = ["Fr_Balise"];

describe("parseChannelList — lecture tolérante (whitelist canaux)", () => {
  it("garde les noms valides, trim + dédoublonne", () => {
    expect(
      parseChannelList(["Fr_Balise", " Fr_BlaBla ", "Fr_Balise"], FALLBACK_CHANNELS),
    ).toEqual(["Fr_Balise", "Fr_BlaBla"]);
  });

  it("retombe sur le fallback si pas un tableau ou tableau vide après filtrage", () => {
    expect(parseChannelList("Fr_Balise", FALLBACK_CHANNELS)).toEqual(FALLBACK_CHANNELS);
    expect(parseChannelList([], FALLBACK_CHANNELS)).toEqual(FALLBACK_CHANNELS);
    expect(parseChannelList(["!!", 3], FALLBACK_CHANNELS)).toEqual(FALLBACK_CHANNELS);
  });
});

describe("requireChannelList — validation écriture", () => {
  it("accepte un tableau de noms valides (trim + dédup)", () => {
    expect(requireChannelList([" Fr_Balise ", "Fr_EMCOM", "Fr_Balise"])).toEqual([
      "Fr_Balise",
      "Fr_EMCOM",
    ]);
  });

  it("jette si vide, pas un tableau, ou nom invalide (injection)", () => {
    expect(() => requireChannelList([])).toThrow();
    expect(() => requireChannelList("Fr_Balise")).toThrow();
    expect(() => requireChannelList(["ok", "a'; DROP TABLE"])).toThrow();
    expect(() => requireChannelList(["ok", 42])).toThrow();
  });
});

const REUNION = { west: 55, south: -21.6, east: 56, north: -20.7 };

describe("parseMapBounds / requireMapBounds — bornes carte", () => {
  it("null = carte ouverte (accepté en lecture et écriture)", () => {
    expect(parseMapBounds(null, REUNION)).toBeNull();
    expect(requireMapBounds(null)).toBeNull();
  });

  it("accepte des bornes valides", () => {
    expect(parseMapBounds(REUNION, null)).toEqual(REUNION);
    expect(requireMapBounds(REUNION)).toEqual(REUNION);
  });

  it("lecture : retombe sur le fallback si invalide", () => {
    expect(parseMapBounds({ west: 56, east: 55, south: -21, north: -20 }, REUNION)).toEqual(
      REUNION,
    );
    expect(parseMapBounds({ west: 0 }, REUNION)).toEqual(REUNION);
  });

  it("écriture : jette si west>=east, south>=north ou hors plage", () => {
    expect(() => requireMapBounds({ west: 56, east: 55, south: -21, north: -20 })).toThrow();
    expect(() => requireMapBounds({ west: 0, east: 1, south: 10, north: 5 })).toThrow();
    expect(() => requireMapBounds({ west: -200, east: 1, south: 0, north: 5 })).toThrow();
    expect(() => requireMapBounds({})).toThrow();
  });
});

describe("parseZoom / requireZoom — zoom min [0,22]", () => {
  it("accepte une valeur dans la plage", () => {
    expect(parseZoom(8, 5)).toBe(8);
    expect(requireZoom("8")).toBe(8);
  });

  it("lecture : fallback hors plage / non numérique", () => {
    expect(parseZoom(-1, 8)).toBe(8);
    expect(parseZoom(23, 8)).toBe(8);
    expect(parseZoom("abc", 8)).toBe(8);
  });

  it("écriture : jette hors plage", () => {
    expect(() => requireZoom(-1)).toThrow();
    expect(() => requireZoom(23)).toThrow();
    expect(() => requireZoom("abc")).toThrow();
  });
});
