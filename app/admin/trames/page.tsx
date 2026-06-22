import { redirect } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { isAdmin } from "@/lib/admin";
import { getRecentPackets, getGatewayOverview } from "@/lib/queries/packets";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// Vue par défaut : aperçu de chaque gateway (charge & portée). Clic -> ses trames.
async function GatewayOverview() {
  const gateways = await getGatewayOverview();
  const now = new Date();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Gateways</h2>
        <Link
          href="/admin/trames?gateway=all"
          className="text-sm text-zinc-500 hover:text-current"
        >
          Flux global (tous gateways) →
        </Link>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Choisis un gateway pour étudier ses 200 dernières trames. Fr_EMCOM exclu.
      </p>

      {gateways.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun gateway actif.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs text-zinc-500 dark:border-white/15">
              <tr>
                <th className="px-3 py-2 font-medium">Gateway</th>
                <th className="px-3 py-2 font-medium">Trames&nbsp;24h</th>
                <th className="px-3 py-2 font-medium">Nodes entendus&nbsp;24h</th>
                <th className="px-3 py-2 font-medium">Dernière trame</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((g) => (
                <tr
                  key={g.gatewayId}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/trames?gateway=${encodeURIComponent(g.gatewayId)}`}
                      className="font-medium hover:underline"
                    >
                      {g.name ?? g.gatewayId}
                    </Link>
                    <div className="font-mono text-xs text-zinc-500">
                      {g.gatewayId}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {g.packets24h.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-2 font-mono">{g.nodes24h}</td>
                  <td className="px-3 py-2 text-zinc-500">
                    {relativeTime(g.lastSeen, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// Vue détail : 200 dernières trames d'un gateway (ou de tous si `all`).
async function FramesView({ gateway }: { gateway: string }) {
  const gatewayId = gateway === "all" ? null : gateway;
  const trames = await getRecentPackets(200, gatewayId);
  const now = new Date();
  const title = gatewayId ? `Gateway ${gatewayId}` : "Flux global (tous gateways)";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <Link
          href="/admin/trames"
          className="text-sm text-zinc-500 hover:text-current"
        >
          ← Gateways
        </Link>
        <h2 className="font-mono text-lg font-semibold">{title}</h2>
        <span className="text-sm text-zinc-500">
          {trames.length} dernières trames — Fr_EMCOM exclu
        </span>
      </div>

      {trames.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune trame pour ce gateway.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-xs">
            <thead className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
              <tr>
                <th className="px-3 py-2 font-medium">Reçu</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Node</th>
                {!gatewayId && <th className="px-3 py-2 font-medium">Gateway</th>}
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
                  {!gatewayId && (
                    <td className="px-3 py-2">{t.gatewayId ?? "—"}</td>
                  )}
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
  );
}

export default async function TramesPage({
  searchParams,
}: {
  searchParams: Promise<{ gateway?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { gateway } = await searchParams;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/admin/trames" />
      {gateway ? <FramesView gateway={gateway} /> : <GatewayOverview />}
    </div>
  );
}
