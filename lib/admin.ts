import { cookies } from "next/headers";
import { verifySession } from "./auth";

export const ADMIN_COOKIE = "mf_admin";

// Vrai si la requête courante porte un cookie de session admin valide.
// Server-only (next/headers). Lit ADMIN_SESSION_SECRET ; sans secret -> refus.
export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifySession(token, secret, Date.now());
}
