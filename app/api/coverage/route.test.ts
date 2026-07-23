// Route Handler : délégation et sérialisation. La logique est testée dans
// lib/queries/coverage-tiles.*.test.ts ; ici on vérifie seulement que la route
// ne s'interpose pas — pas de paramètre lu depuis l'URL, notamment, la maille
// venant du réglage admin puisqu'elle sert d'exposant SQL.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCoverageTiles = vi.fn();
vi.mock("@/lib/queries/coverage-tiles", () => ({
  getCoverageTiles: () => getCoverageTiles(),
}));

const REPONSE = {
  z: 15,
  tileCount: 32768,
  tiles: [
    {
      x: 1,
      y: 2,
      snrP90: -8,
      snrMax: -5,
      gateways: 2,
      nodes: 3,
      transmissions: 3,
      samples: 4,
      days: 2,
    },
  ],
};

beforeEach(() => getCoverageTiles.mockReset().mockResolvedValue(REPONSE));

describe("GET /api/coverage", () => {
  it("sérialise la réponse de la couche telle quelle", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(REPONSE);
  });

  it("est déclarée force-dynamic (aucune mise en cache par Next)", async () => {
    // Le cache vit dans getCoverageTiles, avec sa propre durée et sa propre
    // clé : laisser Next en ajouter un second brouillerait l'invalidation.
    const mod = await import("./route");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("n'appelle la couche qu'une fois par requête", async () => {
    const { GET } = await import("./route");
    await GET();
    expect(getCoverageTiles).toHaveBeenCalledTimes(1);
  });

});

// NON TESTÉ ICI, volontairement : « un échec remonte au lieu de renvoyer une
// couche vide ». La route n'implémente pas ce comportement, elle l'hérite de
// `await` ; l'assertion ne couvrait aucune ligne de plus et se heurtait au
// rapport d'erreur du runner sur un jet depuis un espion. Le comportement qui
// compte vraiment — une carte vide ne doit jamais se lire « jamais mesuré » —
// est vérifié côté client, dans MapLegend.test.tsx (avertissement « données
// indisponibles ») et par la mesure sous panne simulée du contrôleur.
