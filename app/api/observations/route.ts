import { getObservations } from "@/lib/queries/observations";

export const dynamic = "force-dynamic";

// Toile mesh (arêtes gateway × node entendu) et activité directe des
// passerelles sur la dernière heure.
export async function GET() {
  return Response.json(await getObservations());
}
