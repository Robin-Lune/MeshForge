"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE } from "@/lib/admin";

// Déconnexion admin partagée (header global). Vide le cookie de session et
// renvoie vers le login.
export async function logout() {
  (await cookies()).set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  redirect("/admin/login");
}
