import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import NodesTable from "@/components/NodesTable";
import { getNodesOverview } from "@/lib/queries/node-lists";
import type { NodeListItem } from "@/types";

// Rendu au request-time : getNodesOverview() interroge la DB (pas de prérendu).
export const dynamic = "force-dynamic";

type View = "active" | "low-battery" | "misconfigured";

const TABS: { key: View; label: string }[] = [
  { key: "active", label: "Actifs" },
  { key: "low-battery", label: "Batterie faible" },
  { key: "misconfigured", label: "Mal configurés" },
];

const LOW_BATTERY = 20;

const isLowBattery = (n: NodeListItem) =>
  n.batteryPct != null && n.batteryPct < LOW_BATTERY;

// Sélectionne + trie les nodes pour l'onglet demandé.
function selectView(nodes: NodeListItem[], view: View): NodeListItem[] {
  if (view === "low-battery")
    return nodes
      .filter(isLowBattery)
      .sort((a, b) => (a.batteryPct ?? 0) - (b.batteryPct ?? 0));
  if (view === "misconfigured")
    return nodes
      .filter((n) => n.misconfig.length > 0)
      .sort((a, b) => b.misconfig.length - a.misconfig.length);
  return nodes.filter((n) => n.active); // déjà triés last_seen desc par la query
}

export default async function NodesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: raw } = await searchParams;
  const view: View = TABS.some((t) => t.key === raw)
    ? (raw as View)
    : "active";

  const all = await getNodesOverview();
  const counts = {
    active: all.filter((n) => n.active).length,
    "low-battery": all.filter(isLowBattery).length,
    misconfigured: all.filter((n) => n.misconfig.length > 0).length,
  };
  const rows = selectView(all, view);
  const showReasons = view === "misconfigured";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/nodes" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <nav className="mb-4 flex gap-2 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/nodes?view=${t.key}`}
              className={
                "rounded-full px-3 py-1 " +
                (view === t.key
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "border border-black/10 text-zinc-500 hover:text-current dark:border-white/15")
              }
            >
              {t.label}{" "}
              <span className="font-mono text-xs opacity-70">
                {counts[t.key]}
              </span>
            </Link>
          ))}
        </nav>

        <NodesTable
          rows={rows}
          showReasons={showReasons}
          nowIso={new Date().toISOString()}
        />
      </main>
    </div>
  );
}
