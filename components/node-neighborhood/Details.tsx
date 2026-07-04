import type { NodeMapLink, NodeTraceroute, TracerouteHop } from "@/types";
import {
  SNR_BAD,
  SNR_FAIR,
  SNR_GOOD,
  SNR_UNKNOWN_COLOR,
  signalColor,
} from "@/components/map/signal-color";
import {
  SUBJECT_COLOR,
  fmtSnr,
  nodeLabel as label,
  splitHops,
  traceDirectionLabel,
} from "./format";

const hopLabel = (h: number | null) =>
  h === 0 ? "direct" : h == null ? "—" : `${h} hop${h > 1 ? "s" : ""}`;

export function NodeNeighborhoodLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
      <LegendDot color={SUBJECT_COLOR} text="Ce nœud" />
      <LegendDot color={SNR_GOOD} text="Bon (> −7 dB)" />
      <LegendDot color={SNR_FAIR} text="Moyen" />
      <LegendDot color={SNR_BAD} text="Faible (< −15 dB)" />
      <LegendDot color={SNR_UNKNOWN_COLOR} text="SNR inconnu" />
    </div>
  );
}

export function NodeNeighborhoodLinksList({
  links,
  activeNode,
  onHover,
  onToggle,
}: {
  links: NodeMapLink[];
  activeNode: string | null;
  onHover: (nodeId: string | null) => void;
  onToggle: (nodeId: string) => void;
}) {
  return (
    <ul className="max-h-72 divide-y divide-black/5 overflow-auto rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
      {links.map((l) => (
        <li
          key={l.nodeId}
          onMouseEnter={() => onHover(l.nodeId)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onToggle(l.nodeId)}
          className={`flex items-center justify-between gap-3 px-3 py-1.5 text-sm ${
            activeNode === l.nodeId ? "bg-black/5 dark:bg-white/10" : ""
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-none rounded-full ring-1 ring-black/20"
              style={{ background: signalColor(l.snr) }}
            />
            <a
              href={`/node/${encodeURIComponent(l.nodeId)}`}
              onClick={(event) => event.stopPropagation()}
              className="truncate hover:underline"
            >
              {label(l.nodeId, l.name)}
            </a>
          </span>
          <span className="flex flex-none items-center gap-2 font-mono text-xs text-zinc-500">
            <span className={l.hop === 0 ? "text-emerald-600" : ""}>
              {hopLabel(l.hop)}
            </span>
            <span>{fmtSnr(l.snr)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TraceroutePanel({
  activeNode,
  trace,
}: {
  activeNode: string | null;
  trace: NodeTraceroute | null;
}) {
  return (
    <div className="mt-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
      <h4 className="mb-2 text-xs font-semibold text-zinc-500">
        Traceroute
      </h4>
      {trace ? (
        <TraceroutePath trace={trace} />
      ) : (
        <p className="text-xs text-zinc-400">
          {activeNode
            ? "Aucun traceroute disponible pour ce nœud (traceroute passif)."
            : "Survolez ou touchez un nœud pour voir le chemin traceroute (si disponible)."}
        </p>
      )}
    </div>
  );
}

function LegendDot({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="h-2.5 w-2.5 rounded-full ring-1 ring-black/20"
        style={{ background: color }}
      />
      {text}
    </span>
  );
}

function TraceroutePath({ trace }: { trace: NodeTraceroute }) {
  const { forward, back } = splitHops(trace.hops);
  return (
    <div className="space-y-2">
      <HopList title="Aller" hops={forward} />
      {back.length > 0 && <HopList title="Retour" hops={back} />}
    </div>
  );
}

function HopList({ title, hops }: { title: string; hops: TracerouteHop[] }) {
  if (hops.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-medium text-zinc-400">{title}</div>
      <ul className="mt-1 space-y-0.5">
        {hops.map((h) => (
          <li
            key={`${h.direction}-${h.step}`}
            className="flex items-center justify-between gap-2 font-mono text-xs"
          >
            <span className="truncate">
              <span
                className={
                  h.direction === "back"
                    ? "text-violet-400"
                    : "text-emerald-500"
                }
              >
                {traceDirectionLabel(h.direction)}
              </span>{" "}
              {label(h.fromNode, h.fromName)}{" "}
              <span className="text-zinc-400">→</span>{" "}
              {label(h.toNode, h.toName)}
            </span>
            <span className="flex-none text-zinc-500">{fmtSnr(h.snr)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
