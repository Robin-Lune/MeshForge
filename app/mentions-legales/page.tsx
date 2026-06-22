import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Mentions légales — MeshForge" };

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

export default function MentionsLegalesPage() {
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
              <strong>{process.env.LEGAL_COMPANY_NAME}</strong>(
              <strong>{process.env.LEGAL_COMPANY_TYPE}</strong>),{" "}
              <strong>{process.env.LEGAL_COMPANY_ADDRESS}</strong>,{" "}
              <strong>SIRET:{process.env.LEGAL_COMPANY_SIRET}</strong>.
            </p>
            <p>
              Contact :{" "}
              <A href="mailto:contact@la-forge-numerique.com">
                contact@la-forge-numerique.com
              </A>{" "}
              —{" "}
              <A href="https://la-forge-numerique.com">
                la-forge-numerique.com
              </A>
            </p>
            <p>
              Directeur de la publication : <strong>Robin LEBON</strong>.
            </p>
            <p className="text-zinc-400">
              Le réseau LoRa citoyen Mesh de La Réunion est une initiative de{" "}
              <A href="https://www.meteor-oi.re/index.php/projets/reseau-lora-citoyen-mesh-la-reunion/foire-aux-questions/">
                Meteor-oi.re
              </A>{" "}
              ; MeshForge n’en est que l’outil de monitoring.
            </p>
          </Section>

          <Section title="Hébergement">
            <p>
              L’instance de production est hébergée par{" "}
              <strong>{process.env.LEGAL_HOSTING_PROVIDER}</strong>, sur{" "}
              <strong>{process.env.LEGAL_HOSTING_LOCATION}</strong>.
            </p>
          </Section>

          <Section title="Données personnelles (RGPD)">
            <p>
              <strong>Responsable de traitement</strong> : La Forge Numérique
              (contact ci-dessus).
            </p>
            <p>
              <strong>Finalités</strong> : monitoring temps réel et historique
              du réseau LoRa Meshtastic communautaire de La Réunion (couverture,
              qualité des liaisons, santé des relais).
            </p>
            <p>
              <strong>Base légale</strong> : intérêt légitime (art. 6.1.f) — un
              node Meshtastic qui « uplinke » est diffusé par le protocole
              lui-même. Le consentement est respecté <em>à la source</em>{" "}
              (précision de position réglée sur l’appareil, `ok_to_mqtt`), avec
              un <strong>droit de retrait</strong>.
            </p>
            <p>
              <strong>Données traitées</strong> : identifiant de node (NodeID),
              position (à la précision diffusée par l’appareil ; les nodes
              mobiles sont floutés sur une cellule constante), télémétrie
              (batterie, SNR, etc.). Pour les contributeurs : identifiant,
              e-mail (jamais affiché publiquement) et mot de passe haché. Les
              canaux d’urgence (Fr_EMCOM) et privés/chiffrés ne sont{" "}
              <strong>jamais</strong> exposés.
            </p>
            <p>
              <strong>Conservation</strong> : télémétrie ~30 jours (historique)
              ; comptes contributeurs jusqu’à demande de suppression.
            </p>
            <p>
              <strong>Vos droits</strong> (accès, rectification, effacement,
              opposition, limitation — art. 15 à 21) s’exercent par e-mail à{" "}
              <A href="mailto:contact@la-forge-numerique.com">
                contact@la-forge-numerique.com
              </A>
              . Un node peut être <strong>exclu de la carte</strong> (opt-out),{" "}
              <strong>anonymisé</strong> (effacement des noms) ou{" "}
              <strong>supprimé</strong> (effacement de toutes ses données). Vous
              pouvez aussi saisir la <A href="https://www.cnil.fr">CNIL</A>.
            </p>
          </Section>

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
          </Section>
        </div>
      </main>
    </div>
  );
}
