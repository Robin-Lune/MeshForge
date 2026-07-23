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
  parseCoverageTileZoom,
  requireCoverageTileZoom,
  DEFAULT_COVERAGE_TILE_ZOOM,
  MIN_COVERAGE_TILE_ZOOM,
  MAX_COVERAGE_TILE_ZOOM,
  parseLegalInfo,
  requireLegalInfo,
  parseMqttOnboarding,
  requireMqttOnboarding,
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

const LEGAL_FALLBACK = {
  companyName: "À compléter",
  companyType: "À compléter",
  companySiret: "À compléter",
  companyAddress: "À compléter",
  hostingProvider: "À compléter",
  hostingLocation: "À compléter",
};

describe("parseLegalInfo / requireLegalInfo — mentions légales", () => {
  it("lecture : garde et trim les champs texte attendus", () => {
    expect(
      parseLegalInfo(
        {
          companyName: " La Forge Numérique ",
          companyType: "SASU",
          companySiret: "92753858700019",
          companyAddress: "Saint Joseph",
          hostingProvider: "OVH",
          hostingLocation: "Roubaix",
          extra: "ignoré",
        },
        LEGAL_FALLBACK,
      ),
    ).toEqual({
      companyName: "La Forge Numérique",
      companyType: "SASU",
      companySiret: "92753858700019",
      companyAddress: "Saint Joseph",
      hostingProvider: "OVH",
      hostingLocation: "Roubaix",
    });
  });

  it("lecture : retombe sur le fallback si l'objet est incomplet", () => {
    expect(parseLegalInfo({ companyName: "MeshForge" }, LEGAL_FALLBACK)).toEqual(
      LEGAL_FALLBACK,
    );
  });

  it("écriture : refuse les champs vides ou trop longs", () => {
    expect(() => requireLegalInfo({ ...LEGAL_FALLBACK, companyName: "" })).toThrow();
    expect(() =>
      requireLegalInfo({ ...LEGAL_FALLBACK, companyAddress: "x".repeat(501) }),
    ).toThrow();
  });
});

const MQTT_FALLBACK = {
  mobileBroker: "mqtt.la-forge-numerique.com:1883",
  rootTopic: "msh/EU_868",
  encryptionEnabled: true,
  jsonOutputEnabled: true,
  tlsEnabled: false,
  mapReportEnabled: true,
};

describe("parseMqttOnboarding / requireMqttOnboarding", () => {
  it("lecture : garde et trim les champs attendus", () => {
    expect(
      parseMqttOnboarding(
        {
          mobileBroker: " mqtt.example.com:1883 ",
          webBroker: "ancienne-valeur-ignorée",
          rootTopic: " msh/EU_868 ",
          encryptionEnabled: true,
          jsonOutputEnabled: true,
          tlsEnabled: false,
          mapReportEnabled: true,
          extra: "ignoré",
        },
        MQTT_FALLBACK,
      ),
    ).toEqual({
      mobileBroker: "mqtt.example.com:1883",
      rootTopic: "msh/EU_868",
      encryptionEnabled: true,
      jsonOutputEnabled: true,
      tlsEnabled: false,
      mapReportEnabled: true,
    });
  });

  it("lecture : retombe sur le fallback si l'objet est incomplet", () => {
    expect(parseMqttOnboarding({ rootTopic: "msh/EU_868" }, MQTT_FALLBACK)).toEqual(
      MQTT_FALLBACK,
    );
  });

  it("écriture : refuse les champs vides ou trop longs", () => {
    expect(() =>
      requireMqttOnboarding({ ...MQTT_FALLBACK, mobileBroker: "" }),
    ).toThrow();
    expect(() =>
      requireMqttOnboarding({ ...MQTT_FALLBACK, rootTopic: "x".repeat(121) }),
    ).toThrow();
  });
});

// La maille conditionne le SQL (2^z) et la granularité publique : un réglage
// hors plage doit être refusé à l'écriture, jamais silencieusement accepté
// (z20 = millions de tuiles ; z17+ = plus fin que le flou public).
describe("coverage_tile_zoom — maille des tuiles de couverture", () => {
  it("lecture : accepte un entier dans la plage", () => {
    expect(parseCoverageTileZoom(13, DEFAULT_COVERAGE_TILE_ZOOM)).toBe(13);
    expect(parseCoverageTileZoom("16", DEFAULT_COVERAGE_TILE_ZOOM)).toBe(16);
  });

  it("lecture : retombe sur le défaut hors plage ou non entier", () => {
    for (const bad of [11, 17, 20, 15.5, "abc", null, {}]) {
      expect(parseCoverageTileZoom(bad, DEFAULT_COVERAGE_TILE_ZOOM)).toBe(
        DEFAULT_COVERAGE_TILE_ZOOM,
      );
    }
  });

  it("écriture : accepte les bornes incluses", () => {
    expect(requireCoverageTileZoom(MIN_COVERAGE_TILE_ZOOM)).toBe(
      MIN_COVERAGE_TILE_ZOOM,
    );
    expect(requireCoverageTileZoom(MAX_COVERAGE_TILE_ZOOM)).toBe(
      MAX_COVERAGE_TILE_ZOOM,
    );
  });

  it("écriture : refuse hors plage, non entier et non numérique", () => {
    expect(() => requireCoverageTileZoom(MIN_COVERAGE_TILE_ZOOM - 1)).toThrow();
    expect(() => requireCoverageTileZoom(MAX_COVERAGE_TILE_ZOOM + 1)).toThrow();
    expect(() => requireCoverageTileZoom(20)).toThrow();
    expect(() => requireCoverageTileZoom(15.5)).toThrow();
    expect(() => requireCoverageTileZoom("z15")).toThrow();
    expect(() => requireCoverageTileZoom(null)).toThrow();
  });

  it("le défaut est dans la plage autorisée", () => {
    expect(requireCoverageTileZoom(DEFAULT_COVERAGE_TILE_ZOOM)).toBe(
      DEFAULT_COVERAGE_TILE_ZOOM,
    );
  });
});
