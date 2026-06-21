import Link from "next/link";

// Nav partagée (Server Component) entre la carte et les pages analytics.
// `active` = href de la page courante (mise en gras). À étendre au fil des
// blocs Phase 4 (détail node, link graph...).
const LINKS = [
  { href: "/", label: "Carte" },
  { href: "/nodes", label: "Listes" },
  { href: "/stats", label: "Statistiques" },
  { href: "/register", label: "Devenir relais" },
];

export default function Nav({ active }: { active: string }) {
  return (
    <nav className="flex gap-6 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            active === l.href
              ? "font-semibold"
              : "text-zinc-500 transition-colors hover:text-current"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
