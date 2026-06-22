import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Remerciements — MeshForge" };

function Credit({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-surface/40 p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{children}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-mono text-xs text-accent transition-colors hover:text-accent-2"
      >
        {linkLabel} →
      </a>
    </section>
  );
}

export default function RemerciementsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/remerciements" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <h2 className="text-xl font-semibold">Remerciements</h2>
        <p className="mb-6 mt-1 text-sm text-muted">
          MeshForge n’existe que grâce aux acteurs du réseau LoRa citoyen
          réunionnais.
        </p>

        <div className="flex flex-col gap-4">
          <Credit
            title="Meteor-oi.re — l’initiative du réseau"
            href="https://www.meteor-oi.re/index.php/projets/reseau-lora-citoyen-mesh-la-reunion/foire-aux-questions/"
            linkLabel="FAQ du réseau LoRa citoyen Mesh 974"
          >
            La création et la mise en place réelle du réseau LoRa citoyen Mesh de
            La Réunion sont une initiative de <strong>Meteor-oi.re</strong>.
            MeshForge se contente d’en offrir une vue de monitoring.
          </Credit>

          <Credit
            title="La Forge Numérique — développement & hébergement"
            href="https://la-forge-numerique.com"
            linkLabel="la-forge-numerique.com"
          >
            Développement de l’outil MeshForge et hébergement de l’instance de
            production.
          </Credit>

          <Credit
            title="Open source"
            href="https://github.com/Robin-Lune/MeshForge"
            linkLabel="github.com/Robin-Lune/MeshForge"
          >
            MeshForge est libre et ouvert — le code est sur GitHub, les
            contributions sont bienvenues.
          </Credit>
        </div>
      </main>
    </div>
  );
}
