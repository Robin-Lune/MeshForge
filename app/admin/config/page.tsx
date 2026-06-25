import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AdminNav from "@/components/AdminNav";
import { isAdmin } from "@/lib/admin";
import { isSameOrigin } from "@/lib/security";
import { getAllSettings, setSetting } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

async function requireAdminMutation(doneFn: (error: string | null) => never) {
  await requireAdmin();
  if (!isSameOrigin(await headers())) doneFn("Origine refusée.");
}

function done(error: string | null): never {
  redirect(
    error
      ? `/admin/config?err=${encodeURIComponent(error)}`
      : "/admin/config?ok=1",
  );
}

function doneLegal(error: string | null): never {
  redirect(
    error
      ? `/admin/config?tab=legal&err=${encodeURIComponent(error)}`
      : "/admin/config?tab=legal&ok=1",
  );
}

function doneMqtt(error: string | null): never {
  redirect(
    error
      ? `/admin/config?tab=mqtt&err=${encodeURIComponent(error)}`
      : "/admin/config?tab=mqtt&ok=1",
  );
}

async function saveThreshold(formData: FormData) {
  "use server";
  await requireAdminMutation(done);
  let error: string | null = null;
  try {
    await setSetting(
      "misconfig_max_packets_24h",
      String(formData.get("value") ?? ""),
    );
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveChannels(formData: FormData) {
  "use server";
  await requireAdminMutation(done);
  const list = String(formData.get("channels") ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  let error: string | null = null;
  try {
    await setSetting("public_channels", list);
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveZoom(formData: FormData) {
  "use server";
  await requireAdminMutation(done);
  let error: string | null = null;
  try {
    await setSetting("map_min_zoom", String(formData.get("value") ?? ""));
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveBounds(formData: FormData) {
  "use server";
  await requireAdminMutation(done);
  let error: string | null = null;
  try {
    if (formData.get("open") === "on") {
      await setSetting("map_bounds", null);
    } else {
      const n = (k: string) => Number(formData.get(k));
      await setSetting("map_bounds", {
        west: n("west"),
        south: n("south"),
        east: n("east"),
        north: n("north"),
      });
    }
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

async function saveLegal(formData: FormData) {
  "use server";
  await requireAdminMutation(doneLegal);
  let error: string | null = null;
  try {
    await setSetting("legal_info", {
      companyName: String(formData.get("companyName") ?? ""),
      companyType: String(formData.get("companyType") ?? ""),
      companySiret: String(formData.get("companySiret") ?? ""),
      companyAddress: String(formData.get("companyAddress") ?? ""),
      hostingProvider: String(formData.get("hostingProvider") ?? ""),
      hostingLocation: String(formData.get("hostingLocation") ?? ""),
    });
  } catch (e) {
    error = (e as Error).message;
  }
  doneLegal(error);
}

async function saveMqttOnboarding(formData: FormData) {
  "use server";
  await requireAdminMutation(doneMqtt);
  let error: string | null = null;
  try {
    await setSetting("mqtt_onboarding", {
      mobileBroker: String(formData.get("mobileBroker") ?? ""),
      webBroker: String(formData.get("webBroker") ?? ""),
      rootTopic: String(formData.get("rootTopic") ?? ""),
      encryptionEnabled: formData.get("encryptionEnabled") === "on",
      jsonOutputEnabled: formData.get("jsonOutputEnabled") === "on",
      tlsEnabled: formData.get("tlsEnabled") === "on",
      mapReportEnabled: formData.get("mapReportEnabled") === "on",
    });
  } catch (e) {
    error = (e as Error).message;
  }
  doneMqtt(error);
}

const numCls =
  "w-full rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20";
const btnCls =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-zinc-500">{hint}</p>
      {children}
    </section>
  );
}

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; tab?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const s = await getAllSettings();
  const { ok, err, tab } = await searchParams;
  const activeTab = tab === "legal" || tab === "mqtt" ? tab : "network";
  const b = s.map_bounds;
  const legal = s.legal_info;
  const mqtt = s.mqtt_onboarding;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/admin/config" />
      <AdminNav active="/admin/config" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h2 className="mb-4 text-xl font-semibold">Configuration</h2>
        <nav className="mb-4 flex gap-2 text-sm">
          <Link
            href="/admin/config"
            className={`rounded-lg px-3 py-1.5 ${
              activeTab === "network"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                : "border border-black/15 dark:border-white/20"
            }`}
          >
            Réseau
          </Link>
          <Link
            href="/admin/config?tab=legal"
            className={`rounded-lg px-3 py-1.5 ${
              activeTab === "legal"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                : "border border-black/15 dark:border-white/20"
            }`}
          >
            Légal
          </Link>
          <Link
            href="/admin/config?tab=mqtt"
            className={`rounded-lg px-3 py-1.5 ${
              activeTab === "mqtt"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                : "border border-black/15 dark:border-white/20"
            }`}
          >
            MQTT
          </Link>
        </nav>

        {ok && (
          <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            Enregistré.
          </p>
        )}
        {err && (
          <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}

        {activeTab === "network" ? (
        <div className="flex flex-col gap-4">
          <Section
            title="Canaux publics (whitelist)"
            hint="Le worker n'ingère QUE ces canaux (default-deny). Séparés par des virgules. Fr_EMCOM reste exclu de l'affichage par la privacy."
          >
            <form action={saveChannels} className="flex gap-2">
              <input
                name="channels"
                defaultValue={s.public_channels.join(", ")}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>

          <Section
            title="Seuil « node bavard »"
            hint="Au-delà de ce nombre de transmissions distinctes / 24 h, un node est classé « mal configuré »."
          >
            <form action={saveThreshold} className="flex gap-2">
              <input
                name="value"
                type="number"
                min={1}
                defaultValue={s.misconfig_max_packets_24h}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>

          <Section
            title="Bornes de la carte"
            hint="Limite le déplacement hors de la zone. Cocher « carte ouverte » pour ne poser aucune limite (self-host hors Réunion)."
          >
            <form action={saveBounds} className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-xs text-zinc-500">
                  Ouest
                  <input
                    name="west"
                    type="number"
                    step="any"
                    defaultValue={b?.west ?? 54.7}
                    className={numCls}
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Sud
                  <input
                    name="south"
                    type="number"
                    step="any"
                    defaultValue={b?.south ?? -21.9}
                    className={numCls}
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Est
                  <input
                    name="east"
                    type="number"
                    step="any"
                    defaultValue={b?.east ?? 56.3}
                    className={numCls}
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Nord
                  <input
                    name="north"
                    type="number"
                    step="any"
                    defaultValue={b?.north ?? -20.4}
                    className={numCls}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="open"
                    defaultChecked={b === null}
                  />
                  Carte ouverte (aucune limite)
                </label>
                <button className={btnCls}>OK</button>
              </div>
            </form>
          </Section>

          <Section
            title="Zoom minimum"
            hint="Empêche de dézoomer au-delà (0 = monde, 22 = rue). Réunion ≈ 8."
          >
            <form action={saveZoom} className="flex gap-2">
              <input
                name="value"
                type="number"
                min={0}
                max={22}
                step="any"
                defaultValue={s.map_min_zoom}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>
        </div>
        ) : activeTab === "legal" ? (
          <div className="flex flex-col gap-4">
            <Section
              title="Mentions légales"
              hint="Informations affichées sur la page publique /mentions-legales."
            >
              <form action={saveLegal} className="grid gap-3">
                <label className="text-xs text-zinc-500">
                  Nom de l’entreprise
                  <input
                    name="companyName"
                    defaultValue={legal.companyName}
                    className={numCls}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Forme juridique
                    <input
                      name="companyType"
                      defaultValue={legal.companyType}
                      className={numCls}
                    />
                  </label>
                  <label className="text-xs text-zinc-500">
                    SIRET
                    <input
                      name="companySiret"
                      defaultValue={legal.companySiret}
                      className={numCls}
                    />
                  </label>
                </div>
                <label className="text-xs text-zinc-500">
                  Adresse
                  <input
                    name="companyAddress"
                    defaultValue={legal.companyAddress}
                    className={numCls}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Hébergeur
                    <input
                      name="hostingProvider"
                      defaultValue={legal.hostingProvider}
                      className={numCls}
                    />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Localisation hébergement
                    <input
                      name="hostingLocation"
                      defaultValue={legal.hostingLocation}
                      className={numCls}
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button className={btnCls}>Enregistrer</button>
                </div>
              </form>
            </Section>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Section
              title="Onboarding MQTT"
              hint="Valeurs affichées après inscription d'un relais. Utile pour adapter MeshForge à une autre instance."
            >
              <form action={saveMqttOnboarding} className="grid gap-3">
                <label className="text-xs text-zinc-500">
                  Broker app mobile
                  <input
                    name="mobileBroker"
                    defaultValue={mqtt.mobileBroker}
                    className={numCls}
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Broker interface web
                  <input
                    name="webBroker"
                    defaultValue={mqtt.webBroker}
                    className={numCls}
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Sujet principal
                  <input
                    name="rootTopic"
                    defaultValue={mqtt.rootTopic}
                    className={numCls}
                  />
                </label>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="encryptionEnabled"
                      defaultChecked={mqtt.encryptionEnabled}
                    />
                    Chiffrement activé
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="jsonOutputEnabled"
                      defaultChecked={mqtt.jsonOutputEnabled}
                    />
                    Sortie JSON activée
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="tlsEnabled"
                      defaultChecked={mqtt.tlsEnabled}
                    />
                    TLS activé
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="mapReportEnabled"
                      defaultChecked={mqtt.mapReportEnabled}
                    />
                    Rapport cartographique
                  </label>
                </div>
                <div className="flex justify-end">
                  <button className={btnCls}>Enregistrer</button>
                </div>
              </form>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
