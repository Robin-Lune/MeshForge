import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin } from "@/lib/admin";
import { logout } from "@/app/admin/actions";

const LINKS = [
  { href: "/", label: "Carte" },
  { href: "/nodes", label: "Listes" },
  { href: "/stats", label: "Statistiques" },
  { href: "/register", label: "Devenir passerelle MQTT" },
];

const ADMIN_LINKS = [
  { href: "/admin/trames", label: "Trames" },
  { href: "/admin/config", label: "Config" },
];

const linkCls = (active: boolean) =>
  active ? "text-accent" : "text-muted transition-colors hover:text-foreground";

const adminLinkCls = (active: boolean) =>
  "font-mono text-xs uppercase tracking-wider " +
  (active
    ? "text-accent-2"
    : "text-muted transition-colors hover:text-foreground");

export default async function SiteHeader({
  active,
  right,
}: {
  active?: string;
  right?: ReactNode;
}) {
  const admin = await isAdmin();

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/10 px-6 py-3">
      <Link href="/" className="text-lg font-extrabold tracking-tight">
        <span className="text-accent">Mesh</span>Forge
      </Link>

      <nav className="flex items-center gap-5 text-sm font-medium">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={linkCls(active === l.href)}
          >
            {l.label}
          </Link>
        ))}

        {admin && (
          <>
            <span className="h-4 w-px bg-white/15" aria-hidden />
            {ADMIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={adminLinkCls(active === l.href)}
              >
                {l.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-6">
        {right}
        {admin && (
          <form action={logout}>
            <button className="font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-foreground">
              Déconnexion
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
