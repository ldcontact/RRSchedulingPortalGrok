import type { Metadata } from "next";
import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { Icon } from "@/components/icons";
import { Banner, PageHeader } from "@/components/ui";
import { AvatarStack, ProjectStatusPill, TypeTag } from "@/components/status";
import { Pager, pageParam } from "@/components/pager";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { dayKey, fmtDay, fmtWhen, money } from "@/lib/time";
import { PROJECT_SEARCH_HINT } from "@/lib/search";
import { LIST_PAGE_SIZE, PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectSort, type ProjectStatus } from "@/lib/types";

const fmtDate = (iso: string | null) => (iso ? fmtDay(dayKey(iso), { month: "short", day: "numeric", year: "numeric" }) : "—");

export const metadata: Metadata = { title: "Projects" };

const SORTS: Record<ProjectSort, string> = { updated: "Recently updated", newest: "Newest first", name: "Name A–Z", value: "Highest value" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await requireRole("admin", "manager", "sales");
  const sp = await searchParams;
  const status = PROJECT_STATUSES.includes(sp.status as ProjectStatus) ? (sp.status as ProjectStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sort: ProjectSort = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as ProjectSort) : "updated";
  // One database page (range + exact count) plus per-tab counts; search/filter/sort run in Postgres.
  const { items: list, total, page, size, counts, note } = await (await getRepo()).pageProjects({ q, status, page: pageParam(sp.page), size: LIST_PAGE_SIZE, sort });
  const href = (st?: ProjectStatus, p = 1) => `/projects?${new URLSearchParams({ ...(st ? { status: st } : {}), ...(q ? { q } : {}), ...(sort !== "updated" ? { sort } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return (
    <>
      <PageHeader title="Projects" sub={`${total.toLocaleString("en-US")} project${total === 1 ? "" : "s"}${q ? ` match “${q}”` : ""}`}
        actions={user.role === "sales" ? undefined : <PendingLink href="/projects/new" className="btn btn-primary"><Icon name="plus" />New project</PendingLink>} />
      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Filter by status">
        {[undefined, ...PROJECT_STATUSES].map((st) => (
          <Link key={st ?? "all"} href={href(st)} role="tab" aria-selected={status === st}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${status === st ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink"}`}>
            {st ? PROJECT_STATUS_LABEL[st] : "All active"}<span className={`rounded-full px-1.5 text-[11px] ${status === st ? "bg-white/20" : "bg-canvas"}`}>{(counts[st ?? "active"] ?? 0).toLocaleString("en-US")}</span>
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-line bg-white px-3 sm:basis-auto sm:max-w-md">
          <Icon name="search" className="size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder={PROJECT_SEARCH_HINT} className="w-full bg-transparent py-2 text-sm outline-none" type="search" aria-label="Search projects" />
        </div>
        <select name="sort" defaultValue={sort} className="input w-auto" aria-label="Sort projects">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn">Search</button>
        {(q || sort !== "updated") && <Link href={href(status)} className="btn">Clear</Link>}
      </form>
      {typeof sp.ok === "string" && sp.ok && <div className="mb-3"><Banner tone="ok"><Icon name="check" />{sp.ok}</Banner></div>}
      {note && <div className="mb-3"><Banner tone="warn"><Icon name="alert" />{note}</Banner></div>}
      <div className="card divide-y divide-line">
        {list.length === 0 && <div className="p-8 text-center text-muted">{q ? "No projects match your search." : "No projects here yet."}</div>}
        {list.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-[#fafbf9] sm:px-5 xl:grid-cols-[minmax(0,2fr)_130px_90px_100px_150px_120px_16px]">
            <div className="min-w-0">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="truncate text-[12.5px] text-muted">{p.customer_name}</div>
              <div className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted"><Icon name="pin" className="size-3.5 shrink-0" /><span className="truncate" title={p.address || undefined}>{p.address || "No address on file"}</span></div>
              <div className="mt-1.5"><TypeTag type={p.type} /></div>
            </div>
            <div className="justify-self-end xl:justify-self-start"><ProjectStatusPill status={p.status} /></div>
            <div className="text-[12.5px] text-muted">{p.done_milestones}/{p.total_milestones} milestones</div>
            <div className="text-[12.5px]"><div className="font-semibold">{money(p.value)}</div><div className="text-muted">{money(p.est_rebate)} rebate</div></div>
            <div className="text-[12.5px] text-muted">
              <div><span className="font-semibold text-ink">Start</span> {fmtDate(p.start_date)}</div>
              <div><span className="font-semibold text-ink">Completed</span> {fmtDate(p.completed_date)}</div>
            </div>
            <div className="text-[12.5px] text-muted">
              <AvatarStack people={p.team} />
              <div className="mt-1">{p.next_visit ? `Next: ${fmtWhen(p.next_visit)}` : "No visit scheduled"}</div>
            </div>
            <Icon name="right" className="hidden size-4 text-muted xl:block" />
          </Link>
        ))}
      </div>
      <Pager page={page} size={size} total={total} href={(p) => href(status, p)} label="Projects" />
    </>
  );
}
