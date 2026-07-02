import { getDirectLinks } from "@/lib/queries/direct-links";

export const dynamic = "force-dynamic";

// Liens radio directs (hop 0) agrégés sur `sinceH` heures (défaut 24, borné
// 1..720 pour rester une requête raisonnable).
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("sinceH");
  const sinceH = Math.min(Math.max(Math.round(Number(raw) || 24), 1), 720);
  return Response.json(await getDirectLinks(sinceH));
}
