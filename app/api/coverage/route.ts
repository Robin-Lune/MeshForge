import { getCoverageTiles } from "@/lib/queries/coverage-tiles";

export const dynamic = "force-dynamic";

// Couverture radio agrégée par tuile (couche carte). Aucun paramètre client :
// la maille vient du réglage admin `coverage_tile_zoom`, jamais de l'URL — elle
// sert d'exposant SQL et de seuil de precision_bits.
// Réponse compacte (x,y + stats) : le client reconstruit la géométrie via
// tileToBounds. getCoverageTiles porte son propre cache mémoire (10 min).
export async function GET() {
  return Response.json(await getCoverageTiles());
}
