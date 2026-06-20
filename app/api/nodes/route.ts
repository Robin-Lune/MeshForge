import { getPublicNodes } from "@/lib/queries/nodes";

// Donnée live issue de la DB : jamais de cache/prérendu (sinon next build
// taperait la DB et figerait la réponse).
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getPublicNodes());
}
