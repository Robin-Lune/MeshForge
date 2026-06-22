import bcrypt from "bcrypt";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { newSessionToken, SESSION_TTL_MS } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin";
import { getContributorByUsername, canLogin } from "@/lib/queries/contributors";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DUMMY_HASH = bcrypt.hashSync("unused-placeholder", 12);

// Anti-brute-force : 10 tentatives par IP / 15 min (singleton module). Vérifié
// AVANT le bcrypt.compare -> coûte rien à soutenir sous attaque.
const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

async function login(formData: FormData) {
  "use server";
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  if (!loginLimiter.check(ip).allowed) redirect("/admin/login?error=rate");

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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 sm:px-6">
      <h1 className="mb-1 text-lg font-extrabold tracking-tight">
        Mesh<span className="text-accent">Forge</span>
      </h1>
      <p className="mb-6 text-sm text-muted">Accès admin</p>
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
            {error === "rate"
              ? "Trop de tentatives. Réessaie dans quelques minutes."
              : "Identifiants invalides."}
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
