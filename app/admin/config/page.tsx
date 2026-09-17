import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AdminNav from "@/components/AdminNav";
import { isAdmin } from "@/lib/admin";
import { isSameOrigin } from "@/lib/security";
import {
  getAllSettings,
  setSetting,
  MIN_COVERAGE_TILE_ZOOM,
  MAX_COVERAGE_TILE_ZOOM,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  LegalInfoValidationError,
  type LegalInfo,
} from "@/lib/queries/settings";
import { applyRetention } from "@/lib/queries/retention";
import {
  countPacketsOffAllowlist,
  purgeChannelsOffAllowlist,
} from "@/lib/queries/channel-purge";

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

function doneLegal(
  error: string | null,
  field?: keyof LegalInfo,
): never {
  if (!error) redirect("/admin/config?tab=legal&ok=1");
  const params = new URLSearchParams({ tab: "legal", err: error });
  if (field) params.set("field", field);
  redirect(`/admin/config?${params.toString()}`);
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

// Purge EXPLICITE des données déjà stockées sur des canaux qui ne sont plus
// dans l'allowlist (jamais automatique : une faute de frappe dans la liste ne
// doit pas effacer l'historique).
async function purgeOffList() {
  "use server";
  await requireAdminMutation(done);
  let error: string | null = null;
  try {
    await purgeChannelsOffAllowlist(await getAllSettings().then((s) => s.public_channels));
  } catch (e) {
    error = (e as Error).message;
  }
  done(error);
}

// Enregistre puis applique tout de suite : politique TimescaleDB réalignée et
// purge immédiate, pour que la page légale et la base reflètent la valeur saisie.
async function saveRetention(formData: FormData) {
  "use server";
  await requireAdminMutation(done);
  let error: string | null = null;
  try {
    const days = await setSetting(
      "retention_days",
      String(formData.get("value") ?? ""),
    );
    await applyRetention(days);
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

async function saveCoverageTileZoom(formData: FormData) {
  "use server";
  await requireAdminMutation(done);
  let error: string | null = null;
  try {
    await setSetting("coverage_tile_zoom", String(formData.get("value") ?? ""));
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
  let errorField: keyof LegalInfo | undefined;
  try {
    await setSetting("legal_info", {
      companyName: String(formData.get("companyName") ?? ""),
      companyType: String(formData.get("companyType") ?? ""),
      companySiret: String(formData.get("companySiret") ?? ""),
      companyAddress: String(formData.get("companyAddress") ?? ""),
      publisherEmail: String(formData.get("publisherEmail") ?? ""),
      publisherWebsite: String(formData.get("publisherWebsite") ?? ""),
      publicationDirector: String(formData.get("publicationDirector") ?? ""),
      hostingProvider: String(formData.get("hostingProvider") ?? ""),
      hostingLocation: String(formData.get("hostingLocation") ?? ""),
      dataControllerName: String(formData.get("dataControllerName") ?? ""),
      privacyContactEmail: String(formData.get("privacyContactEmail") ?? ""),
      processingPurposes: String(formData.get("processingPurposes") ?? ""),
      additionalNoticeTitle: String(
        formData.get("additionalNoticeTitle") ?? "",
      ),
      additionalNoticeBody: String(
        formData.get("additionalNoticeBody") ?? "",
      ),
      additionalNoticeLinkLabel: String(
        formData.get("additionalNoticeLinkLabel") ?? "",
      ),
      additionalNoticeLinkUrl: String(
        formData.get("additionalNoticeLinkUrl") ?? "",
      ),
      networkName: String(formData.get("networkName") ?? ""),
      initiativeName: String(formData.get("initiativeName") ?? ""),
      initiativeWebsite: String(formData.get("initiativeWebsite") ?? ""),
    });
  } catch (e) {
    error = (e as Error).message;
    if (e instanceof LegalInfoValidationError) errorField = e.field;
  }
  doneLegal(error, errorField);
}

async function saveMqttOnboarding(formData: FormData) {
  "use server";
  await requireAdminMutation(doneMqtt);
  let error: string | null = null;
  try {
    await setSetting("mqtt_onboarding", {
      mobileBroker: String(formData.get("mobileBroker") ?? ""),
      rootTopic: String(formData.get("rootTopic") ?? ""),
      encryptionEnabled: formData.get("encryptionEnabled") === "on",
      jsonOutputEnabled: formData.get("jsonOutputEnabled") === "on",
      tlsEnabled: formData.get("tlsEnabled") === "on",
      mapReportEnabled: formData.get("mapReportEnabled") === "on",
      userChatEnabled: formData.get("userChatEnabled") === "on",
      announcementNodeId: String(
        formData.get("announcementNodeId") ?? "",
      ),
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
  searchParams: Promise<{
    ok?: string;
    err?: string;
    tab?: string;
    field?: string;
  }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const s = await getAllSettings();
  const offList = await countPacketsOffAllowlist(s.public_channels);
  const { ok, err, tab, field } = await searchParams;
  const activeTab = tab === "legal" || tab === "mqtt" ? tab : "network";
  const b = s.map_bounds;
  const legal = s.legal_info;
  const mqtt = s.mqtt_onboarding;
  const legalErrorField = field as keyof LegalInfo | undefined;
  const legalFieldMessage = err?.replace(
    /^mentions légales invalides\s*:\s*/i,
    "",
  );
  const legalFieldProps = (
    name: keyof LegalInfo,
    required = true,
  ) => {
    const invalid = legalErrorField === name;
    return {
      className: `${numCls}${
        invalid
          ? " border-red-500 focus:border-red-500 dark:border-red-500"
          : ""
      }`,
      maxLength: 500,
      required: required || undefined,
      autoFocus: invalid || undefined,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `${name}-error` : undefined,
    };
  };
  const legalFieldError = (name: keyof LegalInfo) =>
    legalErrorField === name && legalFieldMessage ? (
      <span id={`${name}-error`} className="mt-1 block text-xs text-red-600 dark:text-red-400">
        {legalFieldMessage}
      </span>
    ) : null;

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
        <div key="network" className="flex flex-col gap-4">
          <Section
            title="Canaux publics (whitelist)"
            hint="Le worker n'ingère QUE ces canaux (default-deny). Séparés par des virgules. Tout canal listé est ingéré, déchiffré si sa clé est connue, et exposé (carte, toile, fiches, stats) : ne jamais y mettre un canal d'urgence ou privé. La liste est affichée telle quelle sur /mentions-legales."
          >
            <form action={saveChannels} className="flex gap-2">
              <input
                name="channels"
                defaultValue={s.public_channels.join(", ")}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
            <p className="mt-3 text-xs text-zinc-500">
              {offList === 0
                ? "Aucune donnée stockée hors de cette liste."
                : `${offList} paquet(s) stockés sur des canaux hors liste (plus leurs voisinages et traceroutes). Purger supprime ces lignes et recalcule la position des nodes concernés depuis leur dernier paquet valide restant.`}
            </p>
            {offList > 0 && (
              <form action={purgeOffList} className="mt-2">
                <button className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-700 dark:text-red-400">
                  Purger les données hors liste
                </button>
              </form>
            )}
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
            title="Conservation des données"
            hint={`Durée de rétention en jours, entre ${MIN_RETENTION_DAYS} et ${MAX_RETENTION_DAYS}. Purge automatique des paquets (politique TimescaleDB, par tranches de 7 jours), des voisinages, des traceroutes et des nodes muets ; un node exclu ou anonymisé garde sa marque mais perd position et batterie. Sous 30 jours, les vues « 30 j » sont tronquées. La valeur est affichée telle quelle sur /mentions-legales.`}
          >
            <form action={saveRetention} className="flex gap-2">
              <input
                name="value"
                type="number"
                min={MIN_RETENTION_DAYS}
                max={MAX_RETENTION_DAYS}
                step={1}
                defaultValue={s.retention_days}
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

          <Section
            title="Maille de la couche de couverture"
            hint="Taille des tuiles de couverture radio. z13 ≈ 4,6 km · z14 ≈ 2,3 km · z15 ≈ 1,15 km · z16 ≈ 570 m (à La Réunion). Fixe aussi la précision de position minimale acceptée : un node qui diffuse une position plus grossière que la maille est écarté. Attention : les métriques de comptage (relais, émetteurs) ne sont pas comparables d’un réglage à l’autre, et le changement met jusqu’à ~10 min à se propager (cache)."
          >
            <form action={saveCoverageTileZoom} className="flex gap-2">
              <input
                name="value"
                type="number"
                min={MIN_COVERAGE_TILE_ZOOM}
                max={MAX_COVERAGE_TILE_ZOOM}
                step={1}
                defaultValue={s.coverage_tile_zoom}
                className={numCls}
              />
              <button className={btnCls}>OK</button>
            </form>
          </Section>
        </div>
        ) : activeTab === "legal" ? (
          <div key="legal" className="flex flex-col gap-4">
            <Section
              title="Mentions légales"
              hint="Informations affichées sur la page publique /mentions-legales. Remplacer toutes les valeurs « À compléter » et example.invalid avant la mise en ligne."
            >
              <form action={saveLegal} className="grid gap-3">
                <p className="text-sm font-medium">Éditeur du site</p>
                <label className="text-xs text-zinc-500">
                  Nom de l’éditeur
                  <input
                    name="companyName"
                    defaultValue={legal.companyName}
                    {...legalFieldProps("companyName")}
                  />
                  {legalFieldError("companyName")}
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Forme juridique
                    <input
                      name="companyType"
                      defaultValue={legal.companyType}
                      {...legalFieldProps("companyType")}
                    />
                    {legalFieldError("companyType")}
                  </label>
                  <label className="text-xs text-zinc-500">
                    SIRET
                    <input
                      name="companySiret"
                      defaultValue={legal.companySiret}
                      {...legalFieldProps("companySiret")}
                    />
                    {legalFieldError("companySiret")}
                  </label>
                </div>
                <label className="text-xs text-zinc-500">
                  Adresse
                  <input
                    name="companyAddress"
                    defaultValue={legal.companyAddress}
                    {...legalFieldProps("companyAddress")}
                  />
                  {legalFieldError("companyAddress")}
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    E-mail de contact
                    <input
                      name="publisherEmail"
                      type="email"
                      defaultValue={legal.publisherEmail}
                      {...legalFieldProps("publisherEmail")}
                    />
                    {legalFieldError("publisherEmail")}
                  </label>
                  <label className="text-xs text-zinc-500">
                    Site web
                    <input
                      name="publisherWebsite"
                      type="url"
                      defaultValue={legal.publisherWebsite}
                      {...legalFieldProps("publisherWebsite")}
                    />
                    {legalFieldError("publisherWebsite")}
                  </label>
                </div>
                <label className="text-xs text-zinc-500">
                  Directeur ou directrice de la publication
                  <input
                    name="publicationDirector"
                    defaultValue={legal.publicationDirector}
                    {...legalFieldProps("publicationDirector")}
                  />
                  {legalFieldError("publicationDirector")}
                </label>

                <p className="mt-2 text-sm font-medium">Données personnelles</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Responsable de traitement
                    <input
                      name="dataControllerName"
                      defaultValue={legal.dataControllerName}
                      {...legalFieldProps("dataControllerName")}
                    />
                    {legalFieldError("dataControllerName")}
                  </label>
                  <label className="text-xs text-zinc-500">
                    Contact RGPD
                    <input
                      name="privacyContactEmail"
                      type="email"
                      defaultValue={legal.privacyContactEmail}
                      {...legalFieldProps("privacyContactEmail")}
                    />
                    {legalFieldError("privacyContactEmail")}
                  </label>
                </div>
                <label className="text-xs text-zinc-500">
                  Finalités du traitement
                  <textarea
                    name="processingPurposes"
                    defaultValue={legal.processingPurposes}
                    rows={3}
                    {...legalFieldProps("processingPurposes")}
                  />
                  {legalFieldError("processingPurposes")}
                </label>

                <p className="mt-2 text-sm font-medium">
                  Bloc complémentaire (optionnel)
                </p>
                <p className="text-xs text-zinc-500">
                  Ajoute une section libre aux mentions légales, par exemple un
                  sous-traitant ou un partenaire. Laisser les quatre champs vides
                  pour ne rien afficher.
                </p>
                <label className="text-xs text-zinc-500">
                  Titre du bloc
                  <input
                    name="additionalNoticeTitle"
                    defaultValue={legal.additionalNoticeTitle}
                    {...legalFieldProps("additionalNoticeTitle", false)}
                  />
                  {legalFieldError("additionalNoticeTitle")}
                </label>
                <label className="text-xs text-zinc-500">
                  Texte du bloc
                  <textarea
                    name="additionalNoticeBody"
                    defaultValue={legal.additionalNoticeBody}
                    rows={3}
                    {...legalFieldProps("additionalNoticeBody", false)}
                  />
                  {legalFieldError("additionalNoticeBody")}
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Libellé du lien (optionnel)
                    <input
                      name="additionalNoticeLinkLabel"
                      defaultValue={legal.additionalNoticeLinkLabel}
                      {...legalFieldProps("additionalNoticeLinkLabel", false)}
                    />
                    {legalFieldError("additionalNoticeLinkLabel")}
                  </label>
                  <label className="text-xs text-zinc-500">
                    URL du lien (optionnelle)
                    <input
                      name="additionalNoticeLinkUrl"
                      type="url"
                      defaultValue={legal.additionalNoticeLinkUrl}
                      {...legalFieldProps("additionalNoticeLinkUrl", false)}
                    />
                    {legalFieldError("additionalNoticeLinkUrl")}
                  </label>
                </div>

                <p className="mt-2 text-sm font-medium">Réseau suivi</p>
                <label className="text-xs text-zinc-500">
                  Nom du réseau ou du projet
                  <input
                    name="networkName"
                    defaultValue={legal.networkName}
                    {...legalFieldProps("networkName")}
                  />
                  {legalFieldError("networkName")}
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Porteur de l’initiative
                    <input
                      name="initiativeName"
                      defaultValue={legal.initiativeName}
                      {...legalFieldProps("initiativeName")}
                    />
                    {legalFieldError("initiativeName")}
                  </label>
                  <label className="text-xs text-zinc-500">
                    Site de l’initiative
                    <input
                      name="initiativeWebsite"
                      type="url"
                      defaultValue={legal.initiativeWebsite}
                      {...legalFieldProps("initiativeWebsite")}
                    />
                    {legalFieldError("initiativeWebsite")}
                  </label>
                </div>

                <p className="mt-2 text-sm font-medium">Hébergement</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Hébergeur
                    <input
                      name="hostingProvider"
                      defaultValue={legal.hostingProvider}
                      {...legalFieldProps("hostingProvider")}
                    />
                    {legalFieldError("hostingProvider")}
                  </label>
                  <label className="text-xs text-zinc-500">
                    Localisation hébergement
                    <input
                      name="hostingLocation"
                      defaultValue={legal.hostingLocation}
                      {...legalFieldProps("hostingLocation")}
                    />
                    {legalFieldError("hostingLocation")}
                  </label>
                </div>
                <div className="flex justify-end">
                  <button className={btnCls}>Enregistrer</button>
                </div>
              </form>
            </Section>
          </div>
        ) : (
          <div key="mqtt" className="flex flex-col gap-4">
            <Section
              title="Configuration MQTT"
              hint="Paramètres affichés après inscription et comportement MQTT de cette instance MeshForge."
            >
              <form action={saveMqttOnboarding} className="grid gap-3">
                <label className="text-xs text-zinc-500">
                  Adresse du broker
                  <input
                    name="mobileBroker"
                    defaultValue={mqtt.mobileBroker}
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
                <label className="text-xs text-zinc-500">
                  NodeID réservé aux annonces MeshForge
                  <input
                    name="announcementNodeId"
                    required
                    pattern="![0-9a-fA-F]{8}"
                    placeholder="!1234abcd"
                    defaultValue={mqtt.announcementNodeId}
                    className={numCls}
                  />
                  <span className="mt-1 block">
                    Ce NodeID ne doit appartenir à aucun node physique.
                  </span>
                </label>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="userChatEnabled"
                      defaultChecked={mqtt.userChatEnabled}
                    />
                    Chat MQTT USER activé
                  </label>
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
