import { SNR_GOOD } from "./signal-color";

type MapLegendProps = {
  open: boolean;
  onToggle: () => void;
};

export function MapLegend({ open, onToggle }: MapLegendProps) {
  return (
    <div className="pointer-events-none absolute bottom-14 sm:bottom-6 left-2 right-2 z-[120] sm:right-auto">
      {open && (
        <div className="pointer-events-auto mb-2 w-fit max-w-full rounded-lg bg-white/95 px-3 py-2 text-xs leading-tight text-zinc-800 shadow ring-1 ring-black/10 dark:bg-zinc-900/90 dark:text-zinc-100 dark:ring-white/15">
          <div className="grid gap-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-5 min-w-9 flex-none items-center justify-center rounded-[7px] border-2 border-white bg-[#67EA94] px-1.5 text-[10px] font-bold text-emerald-950 shadow">
                GW
              </span>
              <span className="min-w-0 break-words">Gateway MQTT</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-5 min-w-9 flex-none items-center justify-center rounded-[7px] border border-white bg-sky-500 px-1.5 text-[10px] font-semibold text-white shadow-[0_0_0_3px_#2563eb]">
                N
              </span>
              <span className="min-w-0 break-words">
                Vu par plusieurs gateways
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-5 min-w-9 flex-none items-center justify-center rounded-[7px] border border-white bg-sky-500 px-1.5 text-[10px] font-semibold text-white shadow">
                N
              </span>
              <span className="min-w-0 break-words">Node visible</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-1 w-10 flex-none rounded"
                style={{ background: SNR_GOOD }}
              />
              <span className="min-w-0 break-words">Lien direct 0-hop</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-10 flex-none border-t-2 border-dashed border-[#eab308]" />
              <span className="min-w-0 break-words">Lien via relais 1 hop</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-10 flex-none border-t-2 border-dashed border-[#f97316]" />
              <span className="min-w-0 break-words">
                Lien via relais 2 hops
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-10 flex-none border-t-2 border-dashed border-[#ef4444]" />
              <span className="min-w-0 break-words">
                Lien via relais 3+ hops
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-5 min-w-9 flex-none items-center justify-center rounded-[7px] bg-white px-1.5 text-[10px] font-bold text-zinc-900 shadow ring-1 ring-black/10">
                12
              </span>
              <span className="min-w-0 break-words">
                Nombre de paquets sur le lien (au survol)
              </span>
            </div>
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
