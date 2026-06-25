import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AdminNav from "@/components/AdminNav";
import { isAdmin } from "@/lib/admin";
import { getContributorsAdminPage } from "@/lib/queries/contributors";
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
  searchParams: Promise<{ ok?: string; err?: string; page?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { ok, err, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const offset = (page - 1) * PAGE_SIZE;
  const { contributors, total } = await getContributorsAdminPage(
    PAGE_SIZE,
    offset,
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (page > pageCount) redirect(`/admin/contributeurs?page=${pageCount}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/admin/contributeurs" />
      <AdminNav active="/admin/contributeurs" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Contributeurs</h2>
          <span className="text-sm text-zinc-500">
            {total} compte{total > 1 ? "s" : ""}
          </span>
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

        {contributors.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun contributeur.</p>
        ) : (
          <ContributorsManager
            contributors={contributors}
            page={page}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={total}
          />
        )}
      </main>
    </div>
  );
}
