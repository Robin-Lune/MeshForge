"use client";

import { useState } from "react";
import Link from "next/link";

type LinkItem = { href: string; label: string };

// Menu mobile (hamburger). Le header reste un Server Component (auth en DB) ;
// seul ce toggle a besoin d'état client. Les liens + l'action `logout` (Server
// Action) sont passés en props.
export default function MobileMenu({
  links,
  adminLinks,
  active,
  logout,
}: {
  links: LinkItem[];
  adminLinks: LinkItem[];
  active?: string;
  logout: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded text-foreground"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <>
          {/* Tap hors du panneau = fermeture */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute left-0 right-0 top-full z-30 flex min-w-0 flex-col gap-1 border-b border-white/10 bg-background/98 px-4 py-3 shadow-lg backdrop-blur">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className={
                  "min-w-0 break-words rounded px-2 py-2 text-sm font-medium " +
                  (active === l.href
                    ? "text-accent"
                    : "text-foreground/90 hover:bg-white/5")
                }
              >
                {l.label}
              </Link>
            ))}

            {adminLinks.length > 0 && (
              <>
                <span className="mt-1 px-2 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                  Admin
                </span>
                {adminLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={close}
                    className={
                      "min-w-0 break-words rounded px-2 py-2 font-mono text-xs uppercase tracking-wider " +
                      (active === l.href
                        ? "text-accent-2"
                        : "text-muted hover:bg-white/5")
                    }
                  >
                    {l.label}
                  </Link>
                ))}
                <form action={logout}>
                  <button className="w-full min-w-0 break-words rounded px-2 py-2 text-left font-mono text-xs uppercase tracking-wider text-muted hover:bg-white/5">
                    Déconnexion
                  </button>
                </form>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
