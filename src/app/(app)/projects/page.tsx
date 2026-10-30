import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { AvatarStack, ProjectStatusPill, TypeTag } from "@/components/status";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { fmtWhen, money } from "@/lib/time";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  await requireRole("admin", "manager");
  const sp = await searchParams;
  const status = PROJECT_STATUSES.includes(sp.status as ProjectStatus) ? (sp.status as ProjectStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const all = await (await getRepo()).listProjects({ q });
  const list = status ? all.filter((p) => p.status === status) : all.filter((p) => p.status !== "cancelled");
  const count = (st?: ProjectStatus) => (st ? all.filter((p) => p.status === st).length : all.filter((p) => p.status !== "cancelled").length);
  const href = (st?: ProjectStatus) => `/projects?${new URLSearchParams({ ...(st ? { status: st } : {}), ...(q ? { q } : {}) })}`;
  const pipeline = list.reduce((a, p) => a + p.value, 0), rebates = list.reduce((a, p) => a + p.est_rebate, 0);
  return (
    <>
      <PageHeader title="Projects" sub={`${list.length} project${list.length === 1 ? "" : "s"} · ${money(pipeline)} value · ${money(rebates)} est. rebates`}
        actions={<Link href="/projects/new" className="btn btn-primary"><Icon name="plus" />New project</Link>} />
      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Filter by status">
        {[undefined, ...PROJECT_STATUSES].map((st) => (
          <Link key={st ?? "all"} href={href(st)} role="tab" aria-selected={status === st}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${status === st ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink"}`}>
            {st ? PROJECT_STATUS_LABEL[st] : "All active"}<span className={`rounded-full px-1.5 text-[11px] ${status === st ? "bg-white/20" : "bg-canvas"}`}>{count(st)}</span>
          </Link>
        ))}
      </div>
      <form className="mb-4 flex gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3 sm:max-w-md">
          <Icon name="search" className="size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search project, customer, scope…" className="w-full bg-transparent py-2 text-sm outline-none" type="search" aria-label="Search projects" />
        </div>
        <button className="btn">Search</button>
      </form>
      <div className="card divide-y divide-line">
        {list.length === 0 && <div className="p-8 text-center text-muted">No projects here yet.</div>}
        {list.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-[#fafbf9] sm:px-5 lg:grid-cols-[minmax(0,2fr)_150px_120px_110px_120px_16px]">
            <div className="min-w-0">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="truncate text-[12.5px] text-muted">{p.customer_name}</div>
            </div>
            <div className="justify-self-end lg:justify-self-start"><ProjectStatusPill status={p.status} /></div>
            <div className="flex items-center gap-2 text-[12.5px] text-muted lg:block"><TypeTag type={p.type} /><span className="lg:mt-1 lg:block">{p.done_milestones}/{p.total_milestones} milestones</span></div>
            <div className="text-[12.5px]"><div className="font-semibold">{money(p.value)}</div><div className="text-muted">{money(p.est_rebate)} rebate</div></div>
            <div className="text-[12.5px] text-muted">
              <AvatarStack people={p.team} />
              <div className="mt-1">{p.next_visit ? `Next: ${fmtWhen(p.next_visit)}` : "No visit scheduled"}</div>
            </div>
            <Icon name="right" className="hidden size-4 text-muted lg:block" />
          </Link>
        ))}
      </div>
    </>
  );
}
