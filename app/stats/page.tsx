import Nav from "@/components/Nav";
import { BarBreakdown } from "@/components/StatsCharts";
import { getNetworkStats } from "@/lib/queries/stats";

// Rendu au request-time : getNetworkStats() interroge la DB (pas de prérendu).
export const dynamic = "force-dynamic";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="font-mono text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

const pct = (v: number | null): string => (v == null ? "—" : `${v} %`);

export default async function StatsPage() {
  const s = await getNetworkStats();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-8 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <Nav active="/stats" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <h2 className="mb-4 text-xl font-semibold">Statistiques réseau</h2>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Nodes connus" value={String(s.nodesTotal)} />
          <Kpi label="Actifs (24 h)" value={String(s.nodesActive24h)} />
          <Kpi
            label="Paquets (24 h)"
            value={s.packets24h.toLocaleString("fr-FR")}
          />
          <Kpi label="Paquets / min" value={String(s.packetsPerMin)} />
          <Kpi label="Util. canal moy." value={pct(s.avgChannelUtil)} />
          <Kpi label="Air util TX moy." value={pct(s.avgAirUtilTx)} />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <BarBreakdown title="Types de paquets (24 h)" data={s.byPacketType} />
          <BarBreakdown title="Sauts — hops (24 h)" data={s.byHopCount} />
          <BarBreakdown title="Type de carte" data={s.byHwModel} />
          <BarBreakdown title="Rôle" data={s.byRole} />
        </section>
      </main>
    </div>
  );
}
