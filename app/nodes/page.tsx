import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import NodesTable from "@/components/NodesTable";
import {
  getNodesOverviewPage,
  type NodeOverviewView,
} from "@/lib/queries/node-lists";

// Rendu au request-time : getNodesOverview() interroge la DB (pas de prérendu).
export const dynamic = "force-dynamic";

type PerPage = 20 | 50 | 100 | 1000 | "all";

const PER_PAGE_VALUES = [20, 50, 100, 1000] as const;
const VIEW_VALUES: NodeOverviewView[] = [
  "all",
  "active",
  "low-battery",
  "misconfigured",
];

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parsePerPage(value: string | undefined): PerPage {
  if (value === "all") return "all";
  const n = Number(value);
  return PER_PAGE_VALUES.includes(n as (typeof PER_PAGE_VALUES)[number])
    ? (n as PerPage)
    : 50;
}

function parseView(value: string | undefined): NodeOverviewView {
  return VIEW_VALUES.includes(value as NodeOverviewView)
    ? (value as NodeOverviewView)
    : "all";
}

function nodesHref({
  page,
  perPage,
  query,
  view,
}: {
  page: number;
  perPage: PerPage;
  query: string;
  view: NodeOverviewView;
}): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (view !== "all") params.set("view", view);
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  return `/nodes?${params.toString()}`;
}

export default async function NodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    q?: string;
    view?: string;
  }>;
}) {
  const {
    page: rawPage,
    perPage: rawPerPage,
    q: rawQ,
    view: rawView,
  } = await searchParams;
  const page = parsePage(rawPage);
  const perPage = parsePerPage(rawPerPage);
  const view = parseView(rawView);
  const query = String(rawQ ?? "").trim();
  const limit = perPage === "all" ? null : perPage;
  const offset = limit === null ? 0 : (page - 1) * limit;
  const { rows, total } = await getNodesOverviewPage({
    limit,
    offset,
    search: query,
    view,
  });
  const pageCount = limit === null ? 1 : Math.max(1, Math.ceil(total / limit));
  if (page > pageCount) {
    redirect(nodesHref({ page: pageCount, perPage, query, view }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader active="/nodes" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <NodesTable
          key={`${query}:${view}:${page}:${perPage}`}
          rows={rows}
          nowIso={new Date().toISOString()}
          total={total}
          page={page}
          pageCount={pageCount}
          perPage={perPage}
          query={query}
          view={view}
        />
      </main>
    </div>
  );
}
