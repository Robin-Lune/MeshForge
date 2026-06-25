import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import NodeCharts from "@/components/NodeCharts";
import { isAdmin } from "@/lib/admin";
import { isSameOrigin } from "@/lib/security";
import {
  getNodeById,
  setNodeExcluded,
  setNodeGatewayOverride,
  setNodeMobile,
  anonymizeNode,
  deleteNode,
} from "@/lib/queries/nodes";
import {
  getNodeHistory,
  getNodeGateways,
  getNodeDeviceMetrics,
} from "@/lib/queries/node-detail";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirm?: string }>;
}) {
  const { id } = await params;
  const nodeId = decodeURIComponent(id);
  // node chargé d'abord : sa position alimente le calcul de distance vers les gateways.
  const node = await getNodeById(nodeId);
  if (!node) notFound();
  const [history, gateways, deviceMetrics, admin] = await Promise.all([
    getNodeHistory(nodeId),
    getNodeGateways(nodeId, node.lat, node.lon),
    getNodeDeviceMetrics(nodeId),
    isAdmin(),
  ]);
  // Opt-out RGPD : un node retiré est invisible au public (mais l'admin le voit
  // pour le gérer/réintégrer).
  if (node.excluded && !admin) notFound();

  const { confirm } = await searchParams;
  const here = `/node/${encodeURIComponent(nodeId)}`;
  const wasExcluded = node.excluded;
  const wasMobile = node.isMobile;
  const gatewayOverride = node.gatewayOverride;

  async function requireAdminMutation() {
    if (!(await isAdmin())) redirect("/admin/login");
    if (!isSameOrigin(await headers())) redirect(here);
  }

  // Server Actions RGPD — chacune re-vérifie isAdmin() (endpoint à part entière).
  async function toggleExcluded() {
    "use server";
    await requireAdminMutation();
    await setNodeExcluded(nodeId, !wasExcluded);
    redirect(here);
  }
  // Précision position : bascule mobile (flou ~500 m) ↔ fixe (position exacte).
  async function toggleMobile() {
    "use server";
    await requireAdminMutation();
    await setNodeMobile(nodeId, !wasMobile);
    redirect(here);
  }
  async function forceGateway() {
    "use server";
    await requireAdminMutation();
    await setNodeGatewayOverride(nodeId, true);
    redirect(here);
  }
  async function forceNotGateway() {
    "use server";
    await requireAdminMutation();
    await setNodeGatewayOverride(nodeId, false);
    redirect(here);
  }
  async function resetGatewayAuto() {
    "use server";
    await requireAdminMutation();
    await setNodeGatewayOverride(nodeId, null);
    redirect(here);
  }
  async function anonymize() {
    "use server";
    await requireAdminMutation();
    await anonymizeNode(nodeId);
    redirect(here);
  }
  async function remove() {
    "use server";
    await requireAdminMutation();
    await deleteNode(nodeId);
    redirect("/");
  }

  const title = node.longName ?? node.shortName ?? node.nodeId;
  const isBridge = gateways.length >= 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
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
                  className="flex flex-col gap-1 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="font-medium">{g.gatewayName ?? g.gatewayId}</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-zinc-600 dark:text-zinc-300">
                    <span>{fmt(g.snr, " dB")}</span>
                    <span className={g.bestHop === 0 ? "text-emerald-600" : ""}>
                      {hopLabel(g.bestHop)}
                    </span>
                    {g.distanceKm != null && (
                      <span
                        className={g.bestHop === 0 ? "text-emerald-600" : "text-zinc-400"}
                      >
                        {g.distanceKm} km
                      </span>
                    )}
                    <span className="text-zinc-400">{g.packets} pqts</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold">Télémétrie appareil</h3>
          {deviceMetrics.voltage == null &&
          deviceMetrics.channelUtil == null &&
          deviceMetrics.airUtilTx == null ? (
            <p className="text-sm text-zinc-400">
              Aucune télémétrie device reçue sur 30 j (node sans capteurs ou
              module télémétrie désactivé).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Tension" value={fmt(deviceMetrics.voltage, " V")} />
              <Field
                label="Utilisation canal"
                value={fmt(deviceMetrics.channelUtil, " %")}
              />
              <Field
                label="Air util TX"
                value={fmt(deviceMetrics.airUtilTx, " %")}
              />
            </div>
          )}
        </section>

        <section className="mt-8">
          <h3 className="mb-3 text-sm font-semibold">
            Historique <span className="font-normal text-zinc-500">(30 j)</span>
          </h3>
          <NodeCharts data={history} />
        </section>

        {admin && (
          <section className="mt-8 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <h3 className="text-sm font-semibold">
              Précision de la position (admin)
            </h3>
            <p className="mt-2 text-xs text-zinc-500">
              Par défaut, la position d’un node est <strong>approximative</strong>{" "}
              (floutée ~500 m) pour protéger la vie privée — utile si une position
              MQTT précise a été saisie par erreur. À passer en{" "}
              <strong>précise</strong> uniquement pour un relais fixe dont la
              position exacte est assumée.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm">
                Actuel :{" "}
                <strong>
                  {wasMobile ? "approximative (~500 m)" : "précise (exacte)"}
                </strong>
              </span>
              <form action={toggleMobile}>
                <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
                  {wasMobile
                    ? "Marquer comme position précise (fixe)"
                    : "Repasser en position approximative"}
                </button>
              </form>
            </div>
          </section>
        )}

        {admin && (
          <section className="mt-8 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <h3 className="text-sm font-semibold">Statut gateway (admin)</h3>
            <p className="mt-2 text-xs text-zinc-500">
              En auto, MeshForge marque un node comme gateway s’il apparaît dans
              `packets.gateway_id`. L’override sert à corriger manuellement un
              cas ambigu.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm">
                Actuel :{" "}
                <strong>
                  {gatewayOverride === null
                    ? node.isGateway
                      ? "gateway (auto)"
                      : "non-gateway (auto)"
                    : gatewayOverride
                      ? "gateway (forcé)"
                      : "non-gateway (forcé)"}
                </strong>
              </span>
              <form action={forceGateway}>
                <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
                  Marquer gateway
                </button>
              </form>
              <form action={forceNotGateway}>
                <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
                  Marquer non-gateway
                </button>
              </form>
              {gatewayOverride !== null && (
                <form action={resetGatewayAuto}>
                  <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
                    Revenir en auto
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {admin && (
          <section className="mt-8 rounded-lg border border-red-500/30 p-4">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Retrait RGPD (admin)
            </h3>
            {wasExcluded && (
              <p className="mt-2 rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                Ce node est actuellement exclu de l’affichage public (opt-out).
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <form action={toggleExcluded}>
                <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
                  {wasExcluded
                    ? "Réintégrer sur la carte"
                    : "Exclure de la carte (opt-out)"}
                </button>
              </form>
              <form action={anonymize}>
                <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
                  Anonymiser (effacer les noms)
                </button>
              </form>
              {confirm === "delete" ? (
                <form action={remove} className="flex items-center gap-2">
                  <span className="text-sm text-red-700 dark:text-red-400">
                    Suppression définitive ?
                  </span>
                  <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
                    Oui, supprimer
                  </button>
                  <Link href={here} className="text-sm text-zinc-500 hover:text-current">
                    Annuler
                  </Link>
                </form>
              ) : (
                <Link
                  href={`${here}?confirm=delete`}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-700 dark:text-red-400"
                >
                  Supprimer toutes les données…
                </Link>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Anonymiser garde la télémétrie sans identité. Supprimer efface
              définitivement le node et tous ses paquets.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
