import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import { getNodeById } from "@/lib/queries/nodes";

// Request-time : getNodeById interroge la DB.
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

export default async function NodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const node = await getNodeById(decodeURIComponent(id));
  if (!node) notFound();

  const title = node.longName ?? node.shortName ?? node.nodeId;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-8 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <Nav active="" />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
        <div className="mb-1 flex items-center gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          {node.isGateway && (
            <span className="rounded bg-[#67EA94]/25 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Gateway
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

        <p className="mt-8 text-sm text-zinc-400">
          Courbes 30 j (SNR, batterie, paquets/jour) — à venir.
        </p>
      </main>
    </div>
  );
}
