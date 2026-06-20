import { getStats } from "@/lib/queries/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getStats());
}
