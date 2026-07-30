import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import SiteHeader from "@/components/SiteHeader";
import { isAdmin } from "@/lib/admin";
import {
  parseChannelKeys,
  publishMqttAnnouncement,
} from "@/lib/mqtt-announcement";
import { getAllSettings } from "@/lib/queries/settings";
import { isSameOrigin } from "@/lib/security";

export const dynamic = "force-dynamic";

function done(error: string | null): never {
  redirect(
    error
      ? `/admin/annonces?err=${encodeURIComponent(error)}`
      : "/admin/annonces?ok=1",
  );
}

async function sendAnnouncement(formData: FormData) {
  "use server";

  if (!(await isAdmin())) redirect("/admin/login");
  if (!isSameOrigin(await headers())) done("Origine refusée.");

  let error: string | null = null;
  try {
    const settings = await getAllSettings();
    const channel = String(formData.get("channel") ?? "");
    if (!settings.public_channels.includes(channel)) {
      throw new Error("Canal non autorisé.");
    }

    const channelKey = parseChannelKeys(
      process.env.MESHTASTIC_CHANNEL_KEYS,
    )[channel];
    if (!channelKey) {
      throw new Error(`Clé MESHTASTIC_CHANNEL_KEYS absente pour ${channel}.`);
    }

    await publishMqttAnnouncement({
      rootTopic: settings.mqtt_onboarding.rootTopic,
      channel,
      channelKey,
      nodeId: settings.mqtt_onboarding.announcementNodeId,
      message: String(formData.get("message") ?? ""),
    });
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : "Envoi de l'annonce impossible.";
  }

  done(error);
}

const fieldCls =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20";

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const settings = await getAllSettings();
  const { ok, err } = await searchParams;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/admin/annonces" />
      <AdminNav active="/admin/annonces" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h2 className="text-xl font-semibold">Annonce MQTT</h2>
        <p className="mb-5 mt-1 text-sm text-zinc-500">
          L’annonce sera reçue sur le canal choisi par les gateways ayant le
          downlink actif, même si le chat MQTT USER est fermé.
        </p>

        {ok && (
          <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            Annonce publiée.
          </p>
        )}
        {err && (
          <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}

        <form
          action={sendAnnouncement}
          className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Canal
            <select name="channel" required className={fieldCls}>
              {settings.public_channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Message
            <textarea
              name="message"
              required
              maxLength={200}
              rows={5}
              className={fieldCls}
            />
            <span className="text-xs font-normal text-zinc-500">
              200 octets UTF-8 maximum.
            </span>
          </label>

          <button className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Envoyer
          </button>
        </form>
      </main>
    </div>
  );
}
