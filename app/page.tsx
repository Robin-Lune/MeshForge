import MapView from "@/components/MapView";
import SiteHeader from "@/components/SiteHeader";
import { getStats } from "@/lib/queries/stats";
import { getSetting } from "@/lib/queries/settings";

// Rendu au request-time : getStats() interroge la DB (pas de prérendu build).
export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 basis-24 leading-tight sm:flex-none">
      <span className="font-mono text-base font-semibold text-accent">
        {value}
      </span>
      <span className="block min-w-0 break-words text-xs text-muted">
        {label}
      </span>
    </div>
  );
}

export default async function Home() {
  const [stats, bounds, minZoom] = await Promise.all([
    getStats(),
    getSetting("map_bounds"),
    getSetting("map_min_zoom"),
  ]);

  return (
    <div className="flex h-[calc(100dvh-var(--footer-h))] flex-col">
      <SiteHeader
        active="/"
        right={
          <div className="flex min-w-0 flex-wrap justify-end gap-3 sm:gap-6">
            <Stat label="Nodes sur la carte" value={stats.nodesTotal} />
            <Stat label="En ligne (15 min)" value={stats.nodesOnline} />
            <Stat label="Paquets / 24 h" value={stats.packets24h} />
          </div>
        }
      />
      <main className="min-h-0 flex-1">
        <MapView bounds={bounds} minZoom={minZoom} />
      </main>
    </div>
  );
}
