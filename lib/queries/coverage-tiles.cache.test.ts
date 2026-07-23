// Cache de la couche de couverture : TTL, clé, regroupement des appels
// concurrents, éviction sur échec.
//
// PORTÉE DE CE FICHIER — il mocke `pool.query`, donc il n'exécute AUCUN SQL et
// ne prouve rien de la requête elle-même. Le SQL est vérifié ailleurs par
// `coverage-tiles.integration.test.ts` contre PostgreSQL ; le script
// `seed-coverage-tiles.sql` reste un jeu visuel manuel. C'est cette séparation
// qui compte : une base simulée renvoie ce qu'on lui dit et n'analyse jamais la
// requête — elle n'aurait pas attrapé une erreur de syntaxe SQL.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const query = vi.fn();
const getSetting = vi.fn();

vi.mock("../db", () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock("./settings", async (importOriginal) => {
  const reel = await importOriginal<typeof import("./settings")>();
  return { ...reel, getSetting: (k: string) => getSetting(k) };
});

const REUNION = { west: 54.7, south: -21.9, east: 56.3, north: -20.4 };
const CHANNELS = ["Fr_Balise", "Fr_BlaBla"];

const setting = (
  key: string,
  zoom = 15,
  bounds: typeof REUNION | null = REUNION,
  channels = CHANNELS,
) => {
  if (key === "coverage_tile_zoom") return zoom;
  if (key === "map_bounds") return bounds;
  return channels;
};

// Le cache vit dans la portée du module : on le réinitialise en réimportant.
async function neuf() {
  vi.resetModules();
  return import("./coverage-tiles");
}

const ligne = {
  tx: 1,
  ty: 2,
  snrP90: -8,
  snrMax: -5,
  gateways: 2,
  nodes: 3,
  transmissions: 3,
  samples: 4,
  days: 2,
};

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [ligne] });
  getSetting.mockReset().mockImplementation((k: string) => setting(k));
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getCoverageTiles — cache", () => {
  it("interroge la base au premier appel et sert le cache ensuite", async () => {
    const { getCoverageTiles } = await neuf();
    const a = await getCoverageTiles();
    const b = await getCoverageTiles();
    expect(query).toHaveBeenCalledTimes(1);
    expect(b).toBe(a); // même objet, pas seulement égal
    expect(a.z).toBe(15);
    expect(a.tiles).toHaveLength(1);
  });

  it("regroupe les appels CONCURRENTS en une seule requête", async () => {
    // Le cas de la ruée : à l'expiration, N visiteurs simultanés ne doivent
    // pas déclencher N balayages de 30 jours.
    const { getCoverageTiles } = await neuf();
    let resoudre: (v: unknown) => void = () => {};
    query.mockImplementationOnce(
      () => new Promise((r) => { resoudre = r; }),
    );
    const promesses = Array.from({ length: 12 }, () => getCoverageTiles());
    // getCoverageTiles attend ses réglages avant d'atteindre le cache :
    // résoudre tout de suite libérerait un `resoudre` encore non affecté.
    await vi.waitFor(() => expect(query).toHaveBeenCalled());
    resoudre({ rows: [ligne] });
    const res = await Promise.all(promesses);
    expect(query).toHaveBeenCalledTimes(1);
    expect(res.every((r) => r === res[0])).toBe(true);
  });

  it("recalcule quand les BORNES changent, à zoom constant", async () => {
    // C'est la régression trouvée en revue : une clé sur le seul zoom servait
    // l'ancien découpage pendant 10 minutes après un élargissement.
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    getSetting.mockImplementation((k: string) =>
      setting(k, 15, { ...REUNION, east: 57 }),
    );
    await getCoverageTiles();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("recalcule quand le ZOOM change, à bornes constantes", async () => {
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    getSetting.mockImplementation((k: string) => setting(k, 14));
    const r = await getCoverageTiles();
    expect(query).toHaveBeenCalledTimes(2);
    expect(r.z).toBe(14);
  });

  it("distingue une carte ouverte d'une carte bornée", async () => {
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    getSetting.mockImplementation((k: string) => setting(k, 15, null));
    await getCoverageTiles();
    expect(query).toHaveBeenCalledTimes(2);
    // Variante non bornée : zoom, mode démo et canaux.
    expect(query.mock.calls[1][1]).toHaveLength(3);
    expect(query.mock.calls[0][1]).toHaveLength(7);
  });

  it("recalcule quand l'allowlist des canaux change", async () => {
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    getSetting.mockImplementation((k: string) =>
      setting(k, 15, REUNION, ["Fr_Balise"]),
    );
    await getCoverageTiles();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("n'inclut les seeds que sur demande explicite en développement", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COVERAGE_INCLUDE_DEMO", "1");
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    expect(query.mock.calls[0][1][1]).toBe(true);
  });

  it("refuse toujours les seeds en production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COVERAGE_INCLUDE_DEMO", "1");
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    expect(query.mock.calls[0][1][1]).toBe(false);
  });

  it("recalcule après expiration du TTL", async () => {
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    const apres = Date.now() + 600_001;
    vi.spyOn(Date, "now").mockReturnValue(apres);
    await getCoverageTiles();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("ne met PAS un échec en cache pour dix minutes", async () => {
    const { getCoverageTiles } = await neuf();
    query.mockRejectedValueOnce(new Error("base injoignable"));
    await expect(getCoverageTiles()).rejects.toThrow("base injoignable");
    // La tentative suivante doit repartir, pas resservir l'échec.
    await expect(getCoverageTiles()).resolves.toMatchObject({ z: 15 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("refuse un zoom hors plage venu du réglage", async () => {
    const { getCoverageTiles } = await neuf();
    getSetting.mockImplementation((k: string) => setting(k, 20));
    await expect(getCoverageTiles()).rejects.toThrow(/hors plage/);
    expect(query).not.toHaveBeenCalled();
  });

  it("passe les bornes dans l'ordre attendu par la requête", async () => {
    const { getCoverageTiles } = await neuf();
    await getCoverageTiles();
    expect(query.mock.calls[0][1]).toEqual([
      15,
      false,
      CHANNELS,
      REUNION.south,
      REUNION.north,
      REUNION.west,
      REUNION.east,
    ]);
  });
});
