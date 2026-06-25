import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin } from "@/lib/admin";
import { logout } from "@/app/admin/actions";
import MobileMenu from "./MobileMenu";

const LINKS = [
  { href: "/", label: "Carte" },
  { href: "/nodes", label: "Listes" },
  { href: "/stats", label: "Statistiques" },
  { href: "/register", label: "Devenir passerelle MQTT" },
];

const ADMIN_LINKS = [
  { href: "/admin/trames", label: "Admin" },
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
    <header className="relative flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/10 px-4 py-3 sm:px-6">
      <Link
        href="/"
        className="min-w-0 break-words text-lg font-extrabold tracking-tight"
      >
        <span className="text-accent">Mesh</span>Forge
      </Link>

      {/* Nav inline à partir de md ; en dessous, c'est le hamburger qui prend le relais. */}
      <nav className="hidden items-center gap-5 text-sm font-medium md:flex">
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
                className={adminLinkCls(active?.startsWith("/admin") ?? false)}
              >
                {l.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-4 sm:gap-6">
        {right && (
          <div className="hidden min-w-0 items-center justify-end sm:flex">
            {right}
          </div>
        )}
        {admin && (
          <form action={logout} className="hidden md:block">
            <button className="font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-foreground">
              Déconnexion
            </button>
          </form>
        )}
        <MobileMenu
          links={LINKS}
          adminLinks={admin ? ADMIN_LINKS : []}
          active={active}
          logout={logout}
        />
      </div>
    </header>
  );
}
