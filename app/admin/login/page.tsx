import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newSessionToken, SESSION_TTL_MS } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Login admin via Server Action : valide le mot de passe (env ADMIN_PASSWORD),
// pose le cookie de session signé, redirige vers /admin/trames. Pas d'API route
// ni de JS client. En cas d'échec : retour ?error=1.
async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (expected && secret && password === expected) {
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, newSessionToken(Date.now(), secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    redirect("/admin/trames");
  }
  redirect("/admin/login?error=1");
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/admin/trames");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">MeshForge</h1>
      <p className="mb-6 text-sm text-zinc-500">Accès admin — debug Trames</p>
      <form action={login} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          placeholder="Mot de passe admin"
          autoFocus
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Mot de passe invalide.
          </p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Se connecter
        </button>
      </form>
    </main>
  );
}
