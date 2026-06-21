import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdmin, ADMIN_COOKIE } from "@/lib/admin";
import { getAllSettings, setSetting } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";

// Toutes les actions re-vérifient isAdmin() : une Server Action est un endpoint
// à part entière (A01 — autorisation côté serveur, pas juste cacher l'UI).
// setSetting valide strictement (jette si invalide) -> on redirige avec le
// message d'erreur. redirect() est appelé HORS du try (il jette NEXT_REDIRECT).
async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

function done(error: string | null): never {
  redirect(error ? `/admin/config?err=${encodeURIComponent(error)}` : "/admin/config?ok=1");
}

async function saveThreshold(formData: FormData) {
  "use server";
  await requireAdmin();
  let error: string | null = null;
  try {
    await setSetting("misconfig_max_packets_24h", String(formData.get("value") ?? ""));
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveChannels(formData: FormData) {
  "use server";
  await requireAdmin();
  const list = String(formData.get("channels") ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  let error: string | null = null;
  try {
    await setSetting("public_channels", list);
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveZoom(formData: FormData) {
  "use server";
  await requireAdmin();
  let error: string | null = null;
  try {
    await setSetting("map_min_zoom", String(formData.get("value") ?? ""));
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveBounds(formData: FormData) {
  "use server";
  await requireAdmin();
  let error: string | null = null;
  try {
    if (formData.get("open") === "on") {
      await setSetting("map_bounds", null);
    } else {
      const n = (k: string) => Number(formData.get(k));
      await setSetting("map_bounds", {
        west: n("west"),
        south: n("south"),
        east: n("east"),
        north: n("north"),
      });
    }
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function logout() {
  "use server";
  (await cookies()).set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  redirect("/admin/login");
}

const numCls =
  "w-full rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20";
const btnCls =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-zinc-500">{hint}</p>
      {children}
    </section>
  );
}

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const s = await getAllSettings();
  const { ok, err } = await searchParams;
  const b = s.map_bounds;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-6 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/trames" className="text-zinc-500 hover:text-current">
            Trames
          </Link>
          <span className="font-semibold">Config</span>
        </nav>
        <form action={logout} className="ml-auto">
          <button className="text-sm text-zinc-500 hover:text-current">
            Déconnexion
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">
        <h2 className="mb-4 text-xl font-semibold">Configuration réseau</h2>

        {ok && (
          <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            Enregistré.
          </p>
        )}
        {err && (
          <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <Section
            title="Canaux publics (whitelist)"
            hint="Le worker n'ingère QUE ces canaux (default-deny). Séparés par des virgules. Fr_EMCOM reste exclu de l'affichage par la privacy."
          >
            <form action={saveChannels} className="flex gap-2">
              <input
                name="channels"
                defaultValue={s.public_channels.join(", ")}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>

          <Section
            title="Seuil « node bavard »"
            hint="Au-delà de ce nombre de transmissions distinctes / 24 h, un node est classé « mal configuré »."
          >
            <form action={saveThreshold} className="flex gap-2">
              <input
                name="value"
                type="number"
                min={1}
                defaultValue={s.misconfig_max_packets_24h}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>

          <Section
            title="Bornes de la carte"
            hint="Limite le déplacement hors de la zone. Cocher « carte ouverte » pour ne poser aucune limite (self-host hors Réunion)."
          >
            <form action={saveBounds} className="flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-2">
                <label className="text-xs text-zinc-500">
                  Ouest
                  <input name="west" type="number" step="any" defaultValue={b?.west ?? 55} className={numCls} />
                </label>
                <label className="text-xs text-zinc-500">
                  Sud
                  <input name="south" type="number" step="any" defaultValue={b?.south ?? -21.6} className={numCls} />
                </label>
                <label className="text-xs text-zinc-500">
                  Est
                  <input name="east" type="number" step="any" defaultValue={b?.east ?? 56} className={numCls} />
                </label>
                <label className="text-xs text-zinc-500">
                  Nord
                  <input name="north" type="number" step="any" defaultValue={b?.north ?? -20.7} className={numCls} />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="open" defaultChecked={b === null} />
                  Carte ouverte (aucune limite)
                </label>
                <button className={btnCls}>OK</button>
              </div>
            </form>
          </Section>

          <Section
            title="Zoom minimum"
            hint="Empêche de dézoomer au-delà (0 = monde, 22 = rue). Réunion ≈ 8."
          >
            <form action={saveZoom} className="flex gap-2">
              <input
                name="value"
                type="number"
                min={0}
                max={22}
                step="any"
                defaultValue={s.map_min_zoom}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>
        </div>
      </main>
    </div>
  );
}
