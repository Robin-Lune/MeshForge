import type { ReactNode } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getNodesOverview } from "@/lib/queries/node-lists";
import { relativeTime } from "@/lib/format";
import type { MisconfigReason, NodeListItem } from "@/types";

// Rendu au request-time : getNodesOverview() interroge la DB (pas de prérendu).
export const dynamic = "force-dynamic";

type View = "active" | "low-battery" | "misconfigured";

const TABS: { key: View; label: string }[] = [
  { key: "active", label: "Actifs" },
  { key: "low-battery", label: "Batterie faible" },
  { key: "misconfigured", label: "Mal configurés" },
];

const REASON_LABEL: Record<MisconfigReason, string> = {
  "no-nodeinfo": "Pas de nodeinfo",
  "no-position": "Sans position",
  "low-battery": "Batterie faible",
  "too-chatty": "Trop bavard",
};

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

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
      {children}
    </span>
  );
}

function batteryClass(pct: number): string {
  if (pct < 20) return "text-red-600 dark:text-red-400";
  if (pct < 40) return "text-amber-600 dark:text-amber-400";
  return "";
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
  const now = new Date();
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

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun node dans cette vue.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-sm">
              <thead className="border-b border-black/10 text-left text-xs text-zinc-500 dark:border-white/15">
                <tr>
                  <th className="px-3 py-2 font-medium">Node</th>
                  <th className="px-3 py-2 font-medium">Rôle</th>
                  <th className="px-3 py-2 font-medium">Carte</th>
                  <th className="px-3 py-2 font-medium">Batterie</th>
                  <th className="px-3 py-2 font-medium">Tx&nbsp;24h</th>
                  <th className="px-3 py-2 font-medium">Vu</th>
                  {showReasons && (
                    <th className="px-3 py-2 font-medium">Problèmes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr
                    key={n.nodeId}
                    className="border-b border-black/5 last:border-0 dark:border-white/10"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/node/${n.nodeId}`}
                        className="font-medium hover:underline"
                      >
                        {n.longName ?? n.shortName ?? n.nodeId}
                      </Link>
                      {n.isGateway && (
                        <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                          gateway
                        </span>
                      )}
                      <div className="font-mono text-xs text-zinc-500">
                        {n.nodeId}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {n.role ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {n.hwModel ?? "—"}
                    </td>
                    <td
                      className={
                        "px-3 py-2 font-mono " +
                        (n.batteryPct != null ? batteryClass(n.batteryPct) : "")
                      }
                    >
                      {n.batteryPct != null ? `${n.batteryPct} %` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-600 dark:text-zinc-400">
                      {n.packets24h.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {relativeTime(n.lastSeen, now)}
                    </td>
                    {showReasons && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {n.misconfig.map((r) => (
                            <Badge key={r}>{REASON_LABEL[r]}</Badge>
                          ))}
                        </div>
                      </td>
                    )}
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
