import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { isAdmin, ADMIN_COOKIE } from "@/lib/admin";
import { getRecentPackets } from "@/lib/queries/packets";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  (await cookies()).set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  redirect("/admin/login");
}

export default async function TramesPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const trames = await getRecentPackets(200);
  const now = new Date();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-8 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <Nav active="" />
        <form action={logout} className="ml-auto">
          <button className="text-sm text-zinc-500 hover:text-current">
            Déconnexion
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-xl font-semibold">Trames</h2>
          <span className="text-sm text-zinc-500">
            {trames.length} derniers paquets — Fr_EMCOM exclu
          </span>
        </div>

        {trames.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun paquet capté.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-xs">
              <thead className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
                <tr>
                  <th className="px-3 py-2 font-medium">Reçu</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Node</th>
                  <th className="px-3 py-2 font-medium">Gateway</th>
                  <th className="px-3 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 font-medium">RSSI</th>
                  <th className="px-3 py-2 font-medium">SNR</th>
                  <th className="px-3 py-2 font-medium">Hops</th>
                  <th className="px-3 py-2 font-medium">Raw</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {trames.map((t, i) => (
                  <tr
                    key={i}
                    className="border-b border-black/5 align-top last:border-0 dark:border-white/10"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                      {relativeTime(t.receivedAt, now)}
                    </td>
                    <td className="px-3 py-2">{t.packetType ?? "—"}</td>
                    <td className="px-3 py-2">{t.nodeId ?? "—"}</td>
                    <td className="px-3 py-2">{t.gatewayId ?? "—"}</td>
                    <td className="px-3 py-2">{t.channel ?? "—"}</td>
                    <td className="px-3 py-2">{t.rssi ?? "—"}</td>
                    <td className="px-3 py-2">{t.snr ?? "—"}</td>
                    <td className="px-3 py-2">{t.hopCount ?? "—"}</td>
                    <td className="px-3 py-2">
                      <details>
                        <summary className="cursor-pointer text-zinc-400">
                          json
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all text-zinc-500">
                          {JSON.stringify(t.raw)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
