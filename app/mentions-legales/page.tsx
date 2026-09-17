import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import { getSetting } from "@/lib/queries/settings";

export const metadata = { title: "Mentions légales — MeshForge" };
export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-surface/40 p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-accent transition-colors hover:text-accent-2"
  >
    {children}
  </a>
);

export default async function MentionsLegalesPage() {
  const legal = await getSetting("legal_info");
  const retentionDays = await getSetting("retention_days");
  const publicChannels = await getSetting("public_channels");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/mentions-legales" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <h2 className="text-xl font-semibold">Mentions légales</h2>
        <p className="mb-6 mt-1 text-sm text-muted">
          Conformément à la loi n°2004-575 (LCEN) et au RGPD (règlement UE
          2016/679).
        </p>

        <div className="flex flex-col gap-4">
          <Section title="Éditeur du site">
            <p>
              MeshForge est édité par{" "}
              <strong>{legal.companyName}</strong> (
              <strong>{legal.companyType}</strong>),{" "}
              <strong>{legal.companyAddress}</strong>,{" "}
              <strong>SIRET : {legal.companySiret}</strong>.
            </p>
            <p>
              Contact :{" "}
              <A href={`mailto:${legal.publisherEmail}`}>
                {legal.publisherEmail}
              </A>{" "}
              —{" "}
              <A href={legal.publisherWebsite}>{legal.publisherWebsite}</A>
            </p>
            <p>
              Direction de la publication :{" "}
              <strong>{legal.publicationDirector}</strong>.
            </p>
            <p className="text-zinc-400">
              {legal.networkName} est une initiative de{" "}
              <A href={legal.initiativeWebsite}>{legal.initiativeName}</A>{" "}
              ; MeshForge n’en est que l’outil de monitoring.
            </p>
          </Section>

          <Section title="Hébergement">
            <p>
              L’instance de production est hébergée par{" "}
              <strong>{legal.hostingProvider}</strong>, sur{" "}
              <strong>{legal.hostingLocation}</strong>.
            </p>
          </Section>

          <Section title="Données personnelles (RGPD)">
            <p>
              <strong>Responsable de traitement</strong> :{" "}
              {legal.dataControllerName} (contact :{" "}
              <A href={`mailto:${legal.privacyContactEmail}`}>
                {legal.privacyContactEmail}
              </A>
              ).
            </p>
            <p>
              <strong>Finalités</strong> : {legal.processingPurposes}
            </p>
            <p>
              <strong>Base légale</strong> : intérêt légitime (art. 6.1.f) — un
              node Meshtastic qui « uplinke » est diffusé par le protocole
              lui-même. Les réglages de l’appareil sont respectés{" "}
              <em>à la source</em> : la position n’est jamais affichée plus
              précisément que l’appareil ne la diffuse, et le réglage « OK to
              MQTT » (firmware 2.5 et plus) est vérifié par MeshForge sur le
              flux chiffré ; sur le flux JSON, il est appliqué par les
              passerelles Meshtastic récentes, hors de notre contrôle. S’y
              ajoute un <strong>droit de retrait</strong>.
            </p>
            <p>
              <strong>Données traitées</strong> : identifiant de node (NodeID),
              position à la précision diffusée par l’appareil, télémétrie
              (batterie, SNR, etc.). Les coordonnées reçues sont conservées en
              base pendant la durée indiquée ci-dessous ; dans les affichages
              publics, les nodes mobiles sont floutés sur une cellule constante
              d’environ 500 m. Pour les contributeurs : identifiant, e-mail
              (jamais affiché publiquement) et mot de passe haché.
            </p>
            <p>
              <strong>Canaux traités</strong> : seuls les canaux Meshtastic{" "}
              <strong>{publicChannels.join(", ")}</strong> sont ingérés ; tout
              autre canal est ignoré à la réception. Un canal chiffré dont la clé
              est confiée à l’instance est traité comme un canal public : c’est
              cette liste qui protège, pas le chiffrement.
            </p>
            <p>
              <strong>Conservation</strong> : paquets, positions, voisinages et
              traceroutes sont purgés automatiquement au bout de{" "}
              <strong>{retentionDays} jours</strong> (les paquets par tranches de
              7 jours, soit au plus {retentionDays + 7} jours) ; un node sans
              activité depuis {retentionDays} jours est effacé. Comptes
              contributeurs : jusqu’à demande de suppression.
            </p>
            <p>
              <strong>Vos droits</strong> (accès, rectification, effacement,
              opposition, limitation — art. 15 à 21) s’exercent par e-mail à{" "}
              <A href={`mailto:${legal.privacyContactEmail}`}>
                {legal.privacyContactEmail}
              </A>
              . Un node peut être <strong>exclu des affichages publics</strong>{" "}
              (opt-out),{" "}
              <strong>anonymisé</strong> (noms retirés des affichages ; ils
              restent dans les paquets bruts jusqu’à leur purge automatique) ou{" "}
              <strong>supprimé</strong> (effacement des données alors stockées).
              Aucun blocage permanent du NodeID n’est posé : si le node publie
              de nouveau via MQTT, il peut réapparaître. Son propriétaire doit
              désactiver cet uplink pour empêcher une nouvelle collecte. Vous
              pouvez aussi saisir la <A href="https://www.cnil.fr">CNIL</A>.
            </p>
          </Section>

          {legal.additionalNoticeTitle && legal.additionalNoticeBody && (
            <Section title={legal.additionalNoticeTitle}>
              <p>{legal.additionalNoticeBody}</p>
              {legal.additionalNoticeLinkLabel &&
                legal.additionalNoticeLinkUrl && (
                  <p>
                    <A href={legal.additionalNoticeLinkUrl}>
                      {legal.additionalNoticeLinkLabel}
                    </A>
                  </p>
                )}
            </Section>
          )}

          <Section title="Cookies">
            <p>
              Le site dépose un <strong>unique cookie de session</strong>{" "}
              (`mf_admin`), strictement nécessaire à l’authentification de
              l’espace d’administration — exempté de consentement
              (recommandation CNIL). <strong>Aucun</strong> cookie de mesure
              d’audience, publicitaire ou de traçage tiers.
            </p>
          </Section>

          <Section title="Propriété intellectuelle">
            <p>
              MeshForge est un logiciel <strong>open source</strong> :{" "}
              <A href="https://github.com/Robin-Lune/MeshForge">
                github.com/Robin-Lune/MeshForge
              </A>{" "}
              (licence <strong>AGPL-3.0-or-later</strong>).
            </p>
            <p>
              Fonds cartographique © les contributeurs{" "}
              <A href="https://www.openstreetmap.org/copyright">
                OpenStreetMap
              </A>
              , tuiles OpenFreeMap.
            </p>
            <p>
              Meshtastic® et le logo Meshtastic sont des marques de{" "}
              <A href="https://meshtastic.org/docs/legal/licensing-and-trademark/">
                Meshtastic LLC
              </A>{" "}
              (« The Meshtastic logo trademark is the trademark of Meshtastic
              LLC »). MeshForge est un projet communautaire indépendant : le logo
              M-PWRD signale la compatibilité et n’implique ni approbation ni
              parrainage par le projet Meshtastic.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
