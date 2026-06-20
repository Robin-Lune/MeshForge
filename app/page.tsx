import MapView from "@/components/MapView";
import Nav from "@/components/Nav";
import { getStats } from "@/lib/queries/stats";

// Rendu au request-time : getStats() interroge la DB (pas de prérendu build).
export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-mono text-base font-semibold">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

export default async function Home() {
  const stats = await getStats();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-8 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <Nav active="/" />
        <div className="ml-auto flex gap-8">
          <Stat label="Nodes sur la carte" value={stats.nodesTotal} />
          <Stat label="En ligne (15 min)" value={stats.nodesOnline} />
          <Stat label="Paquets / 24 h" value={stats.packets24h} />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <MapView />
      </main>
    </div>
  );
}
