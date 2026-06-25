import Link from "next/link";

const ADMIN_LINKS = [
  { href: "/admin/trames", label: "Trames" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/contributeurs", label: "Contributeurs" },
];

export default function AdminNav({ active }: { active: string }) {
  return (
    <nav className="border-b border-white/10 px-4 py-2 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto text-sm">
        {ADMIN_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 ${
              active === l.href
                ? "bg-accent text-black"
                : "border border-black/10 text-muted transition-colors hover:text-foreground dark:border-white/15"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
