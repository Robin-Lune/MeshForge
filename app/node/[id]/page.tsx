import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import NodeCharts from "@/components/NodeCharts";
import { getNodeById } from "@/lib/queries/nodes";
import { getNodeHistory, getNodeGateways } from "@/lib/queries/node-detail";

// Request-time : interroge la DB.
export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

const fmt = (v: string | number | null, suffix = ""): string =>
  v === null ? "—" : `${v}${suffix}`;
const date = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("fr-FR") : "—";
const hopLabel = (h: number | null): string =>
  h === 0 ? "direct" : h === null ? "—" : `${h} hop${h > 1 ? "s" : ""}`;

export default async function NodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nodeId = decodeURIComponent(id);
  const [node, history, gateways] = await Promise.all([
    getNodeById(nodeId),
    getNodeHistory(nodeId),
    getNodeGateways(nodeId),
  ]);
  if (!node) notFound();

  const title = node.longName ?? node.shortName ?? node.nodeId;
  const isBridge = gateways.length >= 2;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-8 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <Nav active="" />
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          {node.isGateway && (
            <span className="rounded bg-[#67EA94]/25 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Gateway
            </span>
          )}
          {isBridge && (
            <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
              Nœud-pont · {gateways.length} gateways
            </span>
          )}
          {node.isMobile && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              Mobile · position ≈
            </span>
          )}
        </div>
        <p className="mb-6 font-mono text-sm text-zinc-500">{node.nodeId}</p>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Nom court" value={fmt(node.shortName)} />
          <Field label="Type de carte" value={fmt(node.hwModel)} />
          <Field label="Rôle" value={fmt(node.role)} />
          <Field label="Firmware" value={fmt(node.firmware)} />
          <Field label="Batterie" value={fmt(node.batteryPct, " %")} />
          <Field label="Signal (SNR)" value={fmt(node.lastSnr, " dB")} />
          <Field label="Vu le" value={date(node.lastSeen)} />
          <Field label="Découvert le" value={date(node.firstSeen)} />
        </section>

        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold">
            Signal vers les gateways{" "}
            <span className="font-normal text-zinc-500">(30 j)</span>
          </h3>
          {gateways.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun gateway ne l&apos;a entendu sur 30 j.
            </p>
          ) : (
            <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
              {gateways.map((g) => (
                <li
                  key={g.gatewayId}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                >
                  <span className="font-medium">{g.gatewayName ?? g.gatewayId}</span>
                  <span className="flex gap-4 font-mono text-zinc-600 dark:text-zinc-300">
                    <span>{fmt(g.snr, " dB")}</span>
                    <span className={g.bestHop === 0 ? "text-emerald-600" : ""}>
                      {hopLabel(g.bestHop)}
                    </span>
                    <span className="text-zinc-400">{g.packets} pqts</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold">
            Historique <span className="font-normal text-zinc-500">(30 j)</span>
          </h3>
          <NodeCharts data={history} />
        </section>
      </main>
    </div>
  );
}
