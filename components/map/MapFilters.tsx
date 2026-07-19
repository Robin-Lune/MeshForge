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
    // Centrage par `inset-x-2 + mx-auto + w-max`, et NON par
    // `left-1/2 + -translate-x-1/2` : avec `left:50%` et `right:auto`, la
    // largeur disponible d'un élément absolu tombe à la MOITIÉ du conteneur
    // (700 px sur 1400), ce qui faisait passer les filtres à la ligne bien
    // avant d'atteindre max-width. `w-max` dimensionne au contenu, `max-w` le
    // borne, et `flex-wrap` reste le filet sur écran étroit.
    <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-black/10 sm:mx-auto sm:w-max sm:max-w-[calc(100%-1rem)] dark:bg-zinc-800/95 dark:text-zinc-100 dark:ring-white/15">
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Rechercher un node…"
        className="min-w-32 flex-1 rounded border border-black/10 bg-transparent px-2 py-1 sm:w-40 sm:flex-none dark:border-white/20"
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

      {/* Couche de couverture : « off » est une option du sélecteur, pas une
          case à part. Un seul contrôle, un seul état — et le libellé rappelle
          toujours quelle métrique est peinte, ce qu'une case cochée ne dit pas. */}
      <select
        value={coverage}
        onChange={(e) => onCoverageChange(e.target.value as CoverageSelection)}
        className={`${selectClass} sm:hidden`}
        aria-label="Couche de couverture"
      >
        <option value="off">Couverture</option>
        <option value="snr">Qualité (SNR)</option>
        <option value="gateways">Relais</option>
        <option value="nodes">Émetteurs</option>
      </select>
      <select
        value={coverage}
        onChange={(e) => onCoverageChange(e.target.value as CoverageSelection)}
        className={`${selectClass} hidden sm:block`}
        aria-label="Couche de couverture"
      >
        <option value="off">Couverture : off</option>
        <option value="snr">Couverture : qualité (SNR)</option>
        <option value="gateways">Couverture : relais joignables</option>
        <option value="nodes">Couverture : émetteurs distincts</option>
      </select>
    </div>
  );
}
