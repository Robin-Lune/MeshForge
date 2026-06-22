import { getObservations } from "@/lib/queries/observations";

export const dynamic = "force-dynamic";

// Arêtes de la toile mesh (gateway × node entendu).
export async function GET() {
  return Response.json(await getObservations());
}
