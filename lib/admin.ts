import { cookies } from "next/headers";
import { verifySession } from "./auth";
import { getContributorByUsername, canLogin } from "./queries/contributors";

export const ADMIN_COOKIE = "mf_admin";

// Vrai si la requête courante porte une session admin valide. Server-only.
// Double barrière : (1) cookie signé non expiré, (2) le compte est TOUJOURS
// actif et ADMIN en DB -> une désactivation/rétrogradation coupe l'accès
// immédiatement (pas seulement à l'expiration du cookie).
export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const claims = verifySession(token, secret, Date.now());
  if (!claims) return false;
  const row = await getContributorByUsername(claims.sub);
  return row != null && canLogin(row, "ADMIN");
}
