import { getObservations } from "@/lib/queries/observations";

export const dynamic = "force-dynamic";

// Arêtes de la toile mesh (gateway × node entendu). Privacy-aware (cf. requête).
export async function GET() {
  return Response.json(await getObservations());
}
