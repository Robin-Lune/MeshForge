"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";

// Footer global. Easter-egg : triple-clic rapide (< 600 ms entre chaque) sur
// le footer ouvre l'accès admin (/admin/login). Les liens (externes + interne
// Remerciements et mentions-légales) stoppent la propagation pour ne pas compter dans le triple-clic.
export default function Footer() {
  const router = useRouter();
  const taps = useRef<number[]>([]);

  function registerTap() {
    const now = Date.now();
    taps.current = [...taps.current, now].filter((t) => now - t < 600);
    if (taps.current.length >= 3) {
      taps.current = [];
      router.push("/admin/login");
    }
  }

  return (
    <footer
      onClick={registerTap}
      className="flex min-h-(--footer-h) shrink-0 select-none flex-wrap items-center justify-center gap-x-1 gap-y-0.5 border-t border-white/10 px-4 py-1.5 text-center font-mono text-xs text-muted sm:px-6"
    >
      <span className="pr-1 font-bold text-accent">MeshForge</span>
      par
      <a
        href="https://la-forge-numerique.com"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="pl-1 text-accent transition-colors hover:text-accent-2"
      >
        La Forge Numérique
      </a>
      <span className="px-1 text-white/20" aria-hidden>
        ·
      </span>
      <Link
        href="/mentions-legales"
        onClick={(e) => e.stopPropagation()}
        className="transition-colors hover:text-foreground"
      >
        Mentions légales
      </Link>
      <span className="px-1 text-white/20" aria-hidden>
        ·
      </span>
      <Link
        href="/remerciements"
        onClick={(e) => e.stopPropagation()}
        className="transition-colors hover:text-foreground"
      >
        Remerciements
      </Link>
      <span className="px-1 text-white/20" aria-hidden>
        ·
      </span>
      <a
        href="https://github.com/Robin-Lune/MeshForge"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Code source sur GitHub"
        title="Code source (AGPL-3.0)"
        className="inline-flex items-center transition-colors hover:text-foreground"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
    </footer>
  );
}
