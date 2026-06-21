import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newSessionToken, SESSION_TTL_MS } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin";
import { getContributorByUsername, canLogin } from "@/lib/queries/contributors";

export const dynamic = "force-dynamic";

// Hash bidon (format valide) comparé quand le compte n'existe pas : on exécute
// TOUJOURS un bcrypt.compare -> temps de réponse identique que l'utilisateur
// existe ou non (anti-énumération par timing). Calculé une fois au chargement.
const DUMMY_HASH = bcrypt.hashSync("unused-placeholder", 12);

// Login admin via Server Action : username + mot de passe vérifiés en bcrypt
// contre `contributors` (role=ADMIN, actif). Pose le cookie de session signé
// (porte le username) et redirige. Échec -> ?error=1 (message générique : on ne
// révèle jamais si le username existe). Pas d'API route ni de JS client.
async function login(formData: FormData) {
  "use server";
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (secret && username && password) {
    const row = await getContributorByUsername(username);
    const ok = await bcrypt.compare(password, row?.password ?? DUMMY_HASH);
    if (row && ok && canLogin(row, "ADMIN")) {
      const jar = await cookies();
      jar.set(ADMIN_COOKIE, newSessionToken(row.username, Date.now(), secret), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
      });
      redirect("/admin/trames");
    }
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
      <p className="mb-6 text-sm text-zinc-500">Accès admin</p>
      <form action={login} className="flex flex-col gap-3">
        <input
          name="username"
          placeholder="Identifiant"
          autoFocus
          autoComplete="username"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <input
          type="password"
          name="password"
          placeholder="Mot de passe"
          autoComplete="current-password"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Identifiants invalides.
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
