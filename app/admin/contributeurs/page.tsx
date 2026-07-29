import { redirect } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import AdminNav from "@/components/AdminNav";
import { isAdmin } from "@/lib/admin";
import { getContributorsAdminPage } from "@/lib/queries/contributors";
import BulkCreateButton from "./BulkCreateButton";
import ContributorsManager from "./ContributorsManager";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    err?: string;
    page?: string;
    q?: string;
  }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { ok, err, page: pageParam, q } = await searchParams;
  const page = parsePage(pageParam);
  const query = String(q ?? "").trim();
  const offset = (page - 1) * PAGE_SIZE;
  const { contributors, total } = await getContributorsAdminPage(
    PAGE_SIZE,
    offset,
    query,
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (page > pageCount) {
    const params = new URLSearchParams({ page: String(pageCount) });
    if (query) params.set("q", query);
    redirect(`/admin/contributeurs?${params.toString()}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/admin/contributeurs" />
      <AdminNav active="/admin/contributeurs" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Contributeurs</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              {total} compte{total > 1 ? "s" : ""}
            </span>
            <BulkCreateButton />
          </div>
        </div>

        {ok && (
          <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            Enregistré.
          </p>
        )}
        {err && (
          <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}

        <form
          action="/admin/contributeurs"
          className="mb-4 flex max-w-lg flex-wrap gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Username, nom de node ou email…"
            className="min-w-60 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/15"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium dark:border-white/20"
          >
            Rechercher
          </button>
          {query && (
            <Link
              href="/admin/contributeurs"
              className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:text-current"
            >
              Effacer
            </Link>
          )}
        </form>

        {contributors.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {query
              ? "Aucun contributeur ne correspond à cette recherche."
              : "Aucun contributeur."}
          </p>
        ) : (
          <ContributorsManager
            contributors={contributors}
            page={page}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={total}
            query={query}
          />
        )}
      </main>
    </div>
  );
}
