"use client";

import type { CoverageMetric, CoverageSelection } from "@/types";
import { SNR_BAD, SNR_FAIR, SNR_GOOD, SNR_UNKNOWN_COLOR } from "./signal-color";
import { FRESHNESS_STEPS, GATEWAY_COLOR, GATEWAY_INK } from "@/lib/nodeColor";
import { ROLE_BADGES } from "@/lib/nodeRole";
import { BRIDGE_RING, ROLE_CAPSULE, ROLE_CAPSULE_INK } from "./map-dom";

type MapLegendProps = {
  open: boolean;
  onToggle: () => void;
  coverage: CoverageSelection;
  coverageError: boolean;
};

// Paliers affichés pour la métrique active. Les libellés des comptages sont
// ceux utilisés par tileFillColor (coverage-layer.ts) — les deux doivent rester alignés.
const COVERAGE_SCALE: Record<
  CoverageMetric,
  { color: string; label: string }[]
> = {
  snr: [
    { color: SNR_GOOD, label: "Bon lien (SNR > −7 dB)" },
    { color: SNR_FAIR, label: "Lien correct (−7 à −15 dB)" },
    { color: SNR_BAD, label: "Lien limite (< −15 dB)" },
    { color: SNR_UNKNOWN_COLOR, label: "Mesure inexploitable" },
  ],
  gateways: [
    { color: SNR_GOOD, label: "3 relais ou plus depuis un même point" },
    { color: SNR_FAIR, label: "2 relais depuis un même point" },
    { color: SNR_BAD, label: "1 seul relais (fragile)" },
  ],
  nodes: [
    { color: SNR_GOOD, label: "3 émetteurs ou plus" },
    { color: SNR_FAIR, label: "2 émetteurs" },
    { color: SNR_BAD, label: "1 seul émetteur" },
  ],
};

export function MapLegend({
  open,
  onToggle,
  coverage,
  coverageError,
}: MapLegendProps) {
  return (
    <div className="pointer-events-none absolute bottom-14 sm:bottom-6 left-2 right-2 z-[120] sm:right-auto">
      {open && (
        <div className="pointer-events-auto mb-2 w-fit max-w-full rounded-lg bg-white/95 px-3 py-2 text-xs leading-tight text-zinc-800 shadow ring-1 ring-black/10 dark:bg-zinc-900/90 dark:text-zinc-100 dark:ring-white/15">
          <div className="grid gap-1.5">
            <div className="font-semibold">Dernière réception</div>
            {/* Trois colonnes : les libellés sont assez courts pour tenir dans
                la largeur imposée par les entrées « Marques ». */}
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
              {FRESHNESS_STEPS.map((step) => (
                <div key={step.label} className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="inline-flex h-5 min-w-8 flex-none items-center justify-center rounded-[7px] border border-white px-1 text-[10px] font-semibold shadow"
                    style={{ background: step.bg, color: step.fg }}
                  >
                    N
                  </span>
                  <span className="min-w-0 whitespace-nowrap">{step.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-1 border-t border-black/10 pt-1.5 font-semibold dark:border-white/15">
              Marques
            </div>
            {/* Deux colonnes : les libellés courts de ROLE_BADGES y tiennent,
                l'infobulle garde la version explicite. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {/* Échantillon fidèle à la carte : un fragment de pastille, sa
                    capsule et le liseré qui les sépare. */}
                <span className="inline-flex h-5 flex-none items-stretch overflow-hidden rounded-[6px] border border-white text-[9px] font-bold shadow">
                  <span className="w-2" style={{ background: FRESHNESS_STEPS[1].bg }} />
                  <span
                    className="inline-flex w-4 items-center justify-center border-l-[1.5px] border-white"
                    style={{ background: GATEWAY_COLOR, color: GATEWAY_INK }}
                  >
                    5
                  </span>
                </span>
                <span className="min-w-0 whitespace-nowrap">Gateway /1h</span>
              </div>
              {ROLE_BADGES.map((badge) => (
                <div key={badge.letter} className="flex min-w-0 items-center gap-1.5">
                  <span className="inline-flex h-5 flex-none items-stretch overflow-hidden rounded-[6px] border border-white text-[9px] font-bold shadow">
                    <span
                      className="inline-flex w-4 items-center justify-center border-r-[1.5px] border-white"
                      style={{ background: ROLE_CAPSULE, color: ROLE_CAPSULE_INK }}
                    >
                      {badge.letter}
                    </span>
                    <span className="w-2" style={{ background: FRESHNESS_STEPS[1].bg }} />
                  </span>
                  <span className="min-w-0 whitespace-nowrap">{badge.short}</span>
                </div>
              ))}
              {/* Sur toute la largeur : le libellé doit dire QUI capte, sinon
                  « ≥ 2 gateways » se lit comme un compte de nodes. */}
              <div className="col-span-2 flex min-w-0 items-center gap-1.5">
                <span
                  className="inline-flex h-5 min-w-8 flex-none items-center justify-center rounded-[6px] border border-white px-1 text-[10px] font-semibold"
                  style={{
                    background: FRESHNESS_STEPS[0].bg,
                    color: FRESHNESS_STEPS[0].fg,
                    boxShadow: `0 0 0 3px ${BRIDGE_RING}`,
                  }}
                >
                  N
                </span>
                <span className="min-w-0 whitespace-nowrap">
                  Capté par ≥ 2 gateways
                </span>
              </div>
            </div>

            <div className="mt-1 border-t border-black/10 pt-1.5 font-semibold dark:border-white/15">
              Liens
            </div>
            {/* Deux colonnes : « Lien via » se répétait sur chaque ligne, le
                titre de section le dit déjà. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-1 w-7 flex-none rounded"
                  style={{ background: SNR_GOOD }}
                />
                <span className="min-w-0 whitespace-nowrap">Direct 0-hop</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="w-7 flex-none border-t-2 border-dashed border-[#eab308]" />
                <span className="min-w-0 whitespace-nowrap">Relais 1 hop</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="w-7 flex-none border-t-2 border-dashed border-[#f97316]" />
                <span className="min-w-0 whitespace-nowrap">Relais 2 hops</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="w-7 flex-none border-t-2 border-dashed border-[#ef4444]" />
                <span className="min-w-0 whitespace-nowrap">Relais 3+ hops</span>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-5 min-w-9 flex-none items-center justify-center rounded-[7px] bg-white px-1.5 text-[10px] font-bold text-zinc-900 shadow ring-1 ring-black/10">
                12
              </span>
              <span className="min-w-0 break-words">
                Paquets sur le lien (au survol)
              </span>
            </div>

            {coverage !== "off" && coverageError && (
              <>
                <div className="mt-1 border-t border-black/10 pt-1.5 font-semibold dark:border-white/15">
                  Couverture radio
                </div>
                {/* Une couche vide sur échec de chargement se lirait « aucune
                    mesure ». On le dit explicitement pour couper court. */}
                <div className="flex min-w-0 items-start gap-2">
                  <span aria-hidden className="flex-none">
                    ⚠️
                  </span>
                  <span className="min-w-0 break-words">
                    <strong>Données indisponibles</strong> — le chargement a
                    échoué. L&apos;absence de tuiles ne reflète pas la couverture
                    réelle.
                  </span>
                </div>
              </>
            )}

            {coverage !== "off" && !coverageError && (
              <>
                <div className="mt-1 border-t border-black/10 pt-1.5 font-semibold dark:border-white/15">
                  Couverture radio
                </div>
                {COVERAGE_SCALE[coverage].map(({ color, label }) => (
                  <div key={label} className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-4 w-10 flex-none rounded-sm"
                      style={{ background: color, opacity: 0.45 }}
                    />
                    <span className="min-w-0 break-words">{label}</span>
                  </div>
                ))}
                {/* ENTRÉE ESSENTIELLE : sans elle, une zone blanche se lit
                    « pas de réseau » alors qu'elle veut dire « aucune mesure
                    attribuable ». La confusion rendrait la couche trompeuse
                    pour décider où poser un relais — précisément son usage. */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-10 flex-none rounded-sm border border-dashed border-black/30 dark:border-white/30" />
                  <span className="min-w-0 break-words">
                    <strong>Non exploré</strong> — aucune mesure
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="pointer-events-auto max-w-full rounded bg-black/75 px-2.5 py-1.5 text-left text-xs font-medium text-white shadow ring-1 ring-white/20"
      >
        {open ? "Masquer la légende" : "Légende"}
      </button>
    </div>
  );
}
