"use client";

import type { CoverageSelection } from "@/types";

export type HopFilter = "all" | "0" | "1" | "2" | "3plus";

type MapFiltersProps = {
  search: string;
  role: string;
  roleOptions: string[];
  sinceH: number;
  hopFilter: HopFilter;
  coverage: CoverageSelection;
  onSearchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onSinceHChange: (value: number) => void;
  onHopFilterChange: (value: HopFilter) => void;
  onCoverageChange: (value: CoverageSelection) => void;
};

export function MapFilters({
  search,
  role,
  roleOptions,
  sinceH,
  hopFilter,
  coverage,
  onSearchChange,
  onRoleChange,
  onSinceHChange,
  onHopFilterChange,
  onCoverageChange,
}: MapFiltersProps) {
  const selectClass =
    "min-w-0 flex-1 rounded border border-black/10 bg-transparent px-2 py-1 sm:flex-none dark:border-white/20";

  const renderRoleChoices = () =>
    roleOptions.map((r) => (
      <option key={r} value={r}>
        {r}
      </option>
    ));

  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 sm:mx-auto sm:w-max sm:max-w-[calc(100%-1rem)]">
      {/* Centrage par `mx-auto + w-max`, et NON par
          `left-1/2 + -translate-x-1/2` : la translation réduisait la largeur
          disponible et faisait passer les filtres à la ligne trop tôt. */}
      <div
        role="group"
        aria-label="Filtres de nodes"
        className="pointer-events-auto flex w-full flex-wrap items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-black/10 dark:bg-zinc-800/95 dark:text-zinc-100 dark:ring-white/15"
      >
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher un node…"
          className="w-full min-w-0 flex-none rounded border border-black/10 bg-transparent px-2 py-1 sm:w-40 dark:border-white/20"
        />
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          className={`${selectClass} sm:hidden`}
        >
          <option value="">Rôles</option>
          {renderRoleChoices()}
        </select>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          className={`${selectClass} hidden sm:block`}
        >
          <option value="">Tous rôles</option>
          {renderRoleChoices()}
        </select>
        <select
          value={sinceH}
          onChange={(e) => onSinceHChange(Number(e.target.value))}
          className={`${selectClass} sm:hidden`}
        >
          <option value={0}>Vus</option>
          <option value={24}>24 h</option>
          <option value={168}>7 j</option>
          <option value={720}>30 j</option>
        </select>
        <select
          value={sinceH}
          onChange={(e) => onSinceHChange(Number(e.target.value))}
          className={`${selectClass} hidden sm:block`}
        >
          <option value={0}>Vus : tous</option>
          <option value={24}>24 h</option>
          <option value={168}>7 j</option>
          <option value={720}>30 j</option>
        </select>
        <select
          value={hopFilter}
          onChange={(e) => onHopFilterChange(e.target.value as HopFilter)}
          className={`${selectClass} sm:hidden`}
        >
          <option value="all">Hops</option>
          <option value="0">0-hop</option>
          <option value="1">1 hop</option>
          <option value="2">2 hops</option>
          <option value="3plus">3 hops+</option>
        </select>
        <select
          value={hopFilter}
          onChange={(e) => onHopFilterChange(e.target.value as HopFilter)}
          className={`${selectClass} hidden sm:block`}
        >
          <option value="all">Hops : tous</option>
          <option value="0">0-hop + gateways</option>
          <option value="1">1 hop</option>
          <option value="2">2 hops</option>
          <option value="3plus">3 hops+</option>
        </select>

        <select
          value={coverage}
          onChange={(e) =>
            onCoverageChange(e.target.value as CoverageSelection)
          }
          className={`${selectClass} hidden lg:block`}
          aria-label="Couche de couverture"
        >
          <option value="off">Couverture : off</option>
          <option value="snr">Couverture : qualité (SNR)</option>
          <option value="gateways">Couverture : relais joignables</option>
          <option value="nodes">Couverture : émetteurs distincts</option>
        </select>
      </div>

      <div className="pointer-events-auto relative mt-2 w-full lg:hidden">
        <select
          value={coverage}
          onChange={(e) =>
            onCoverageChange(e.target.value as CoverageSelection)
          }
          aria-label="Couche de couverture mobile et tablette"
          className={`w-full appearance-none rounded-lg border px-3 py-2.5 pr-10 text-sm font-medium text-zinc-100 shadow backdrop-blur-sm outline-none transition focus:ring-2 ${
            coverage === "off"
              ? "border-white/15 bg-zinc-800/95 focus:border-sky-400 focus:ring-sky-400/30"
              : "border-emerald-400/60 bg-emerald-800/95 focus:border-emerald-300 focus:ring-emerald-300/30"
          }`}
        >
          <option value="off">Couverture radio · Désactivée</option>
          <option value="snr">Couverture radio · Qualité du signal</option>
          <option value="gateways">Couverture radio · Relais joignables</option>
          <option value="nodes">Couverture radio · Émetteurs distincts</option>
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-300"
        >
          <path
            d="m6 8 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
