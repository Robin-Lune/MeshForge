import { getTraceroutePaths } from "@/lib/queries/traceroute-paths";

export const dynamic = "force-dynamic";

// Trajets logiques A↔D (traceroute) sur `sinceH` heures (défaut 168 = 7 j).
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("sinceH");
  const sinceH = Math.min(Math.max(Math.round(Number(raw) || 168), 1), 720);
  return Response.json(await getTraceroutePaths(sinceH));
}
