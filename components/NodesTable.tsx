"use client";

import { useState } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import { sortNodeList, type SortKey, type SortDir } from "@/lib/nodeSort";
import type { MisconfigReason, NodeListItem } from "@/types";

const REASON_LABEL: Record<MisconfigReason, string> = {
  "no-nodeinfo": "Pas de nodeinfo",
  "no-position": "Sans position",
  "low-battery": "Batterie faible",
  "too-chatty": "Trop bavard",
};

// Colonnes triables (clic sur l'en-tête). « Problèmes » reste non triable.
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Node" },
  { key: "role", label: "Rôle" },
  { key: "hwModel", label: "Carte" },
  { key: "batteryPct", label: "Batterie" },
  { key: "packets24h", label: "Tx 24h" },
  { key: "lastSeen", label: "Vu" },
];

function batteryClass(pct: number): string {
  if (pct < 20) return "text-red-600 dark:text-red-400";
  if (pct < 40) return "text-amber-600 dark:text-amber-400";
  return "";
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
      {children}
    </span>
  );
}

// Tableau interactif des nodes : recherche (nom/id) + tri par colonne, le tout
// côté client sur les lignes déjà filtrées par onglet (rows). nowIso vient du
// serveur pour que le rendu initial (et donc l'hydratation) soit déterministe.
export default function NodesTable({
  rows,
  showReasons,
  nowIso,
}: {
  rows: NodeListItem[];
  showReasons: boolean;
  nowIso: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const now = new Date(nowIso);

  const q = search.trim().toLowerCase();
  let view = q
    ? rows.filter((n) =>
        `${n.nodeId} ${n.longName ?? ""} ${n.shortName ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : rows;
  if (sort) view = sortNodeList(view, sort.key, sort.dir);

  // Clic en-tête : asc → desc → retour à l'ordre par défaut de l'onglet.
  function toggleSort(key: SortKey) {
    setSort((s) =>
      s?.key !== key
        ? { key, dir: "asc" }
        : s.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  }

  const arrow = (key: SortKey): string =>
    sort?.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="flex flex-col gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un node (nom ou ID)…"
        className="w-full max-w-xs rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/15"
      />

      {view.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {rows.length === 0
            ? "Aucun node dans cette vue."
            : "Aucun node ne correspond à la recherche."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs text-zinc-500 dark:border-white/15">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="-mx-1 rounded px-1 font-medium hover:text-current"
                    >
                      {c.label}
                      <span className="text-zinc-400">{arrow(c.key)}</span>
                    </button>
                  </th>
                ))}
                {showReasons && (
                  <th className="px-3 py-2 font-medium">Problèmes</th>
                )}
              </tr>
            </thead>
            <tbody>
              {view.map((n) => (
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
    </div>
  );
}
