"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { useOptionalNavProgress } from "@/components/nav-progress";
import { PendingLink } from "@/components/pending-link";
import { SalesMap } from "@/components/sales/sales-map";
import { SalesPipelineTable } from "@/components/sales/sales-pipeline-table";
import { PIPELINE_DEFS, stageBySlug } from "@/lib/sales/catalog";
import { avgDaysOpen, pipelineCounts as countByPipeline } from "@/lib/sales/pipeline-table";
import { dealLengthDays, type SalesAlert, type SalesDeal, type SalesInboxItem } from "@/lib/sales/types";
import type { FunnelRow, RepRow, StageTimeRow } from "@/lib/sales/dashboard";

type Dashboard = { pipelineName: string; openDeals: number; openValue: number; won: number; lost: number; funnel: FunnelRow[]; reps: RepRow[]; stageTime: StageTimeRow[] };
import { acceptInboxAction, dismissInboxAction, markAlertReadAction, moveDealStage } from "./actions";

export type SalesView = "table" | "kanban" | "calendar" | "aging" | "map" | "inbox" | "dashboard";

const VIEWS: { id: SalesView; label: string; short?: string; icon: string }[] = [
  { id: "table", label: "Table", icon: "list" },
  { id: "kanban", label: "Kanban", icon: "kanban" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "aging", label: "Aging", icon: "clock" },
  { id: "map", label: "Map", icon: "map" },
  { id: "inbox", label: "Inbox", icon: "mail" },
  { id: "dashboard", label: "Dashboard", short: "Dash", icon: "funnel" },
];

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtDay(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}

function StagePill({ pipeline, stage }: { pipeline: string; stage: string }) {
  const s = stageBySlug(pipeline, stage);
  return <span className="pill shrink-0" style={{ background: s?.bg, color: s?.color }}>{s?.name ?? stage}</span>;
}

function Pri({ p }: { p: string }) {
  const tone = p === "High" ? "bg-rose-100 text-rose-800" : p === "Low" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800";
  return <span className={`pill ${tone}`}>{p}</span>;
}


const PIPE_SHORT: Record<string, string> = {
  single_family_whe: "Single Family WHE",
  multifamily_whe: "Multifamily",
  led_lighting: "LED",
  hvac: "HVAC",
};

export function SalesWorkspace(props: {
  view: SalesView;
  pipeline: string;
  deals: SalesDeal[];
  allDeals: SalesDeal[];
  inbox: SalesInboxItem[];
  alerts: SalesAlert[];
  owners: Record<string, string>;
  ownerColors?: Record<string, string>;
  ownerAvatars?: Record<string, string | null>;
  dashboard: Dashboard;
  canDelete: boolean;
  query: string;
  ownerFilter: string;
  priorityFilter: string;
}) {
  const router = useRouter();
  const nav = useOptionalNavProgress();
  const hrefFor = (next: Partial<{ view: string; pipeline: string; q: string; owner: string; priority: string }> = {}) => {
    const sp = new URLSearchParams();
    const view = next.view ?? props.view;
    const pipeline = next.pipeline ?? props.pipeline;
    const q = next.q ?? props.query;
    const owner = next.owner ?? props.ownerFilter;
    const priority = next.priority ?? props.priorityFilter;
    if (view !== "table") sp.set("view", view);
    if (pipeline !== "single_family_whe") sp.set("pipeline", pipeline);
    if (q) sp.set("q", q);
    if (owner) sp.set("owner", owner);
    if (priority) sp.set("priority", priority);
    return `/sales${sp.toString() ? `?${sp}` : ""}`;
  };
  const go = (next: Partial<{ view: string; pipeline: string; q: string; owner: string; priority: string }>) => {
    const href = hrefFor(next);
    if (href === hrefFor()) return;
    nav?.start();
    router.push(href);
  };
  const pipe = PIPELINE_DEFS.find((p) => p.slug === props.pipeline);
  const deals = props.deals.filter((d) => {
    if (props.ownerFilter && (d.owner_id ?? "") !== props.ownerFilter) return false;
    if (props.priorityFilter && d.priority !== props.priorityFilter) return false;
    return true;
  });
  const counts = countByPipeline(props.allDeals, PIPELINE_DEFS.map((p) => p.slug));
  const avg = avgDaysOpen(deals);
  const ownerOptions = [...new Set(props.allDeals.filter((d) => d.pipeline_slug === props.pipeline && d.owner_id).map((d) => d.owner_id as string))]
    .map((id) => [id, props.owners[id] ?? "Unknown"] as const)
    .sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      {props.alerts.filter((a) => !a.read_at).length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">Stuck-in-stage alerts</div>
          <ul className="flex flex-col gap-1">
            {props.alerts.filter((a) => !a.read_at).slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                <Link href={a.deal_id ? `/sales/deals/${a.deal_id}` : "/sales"} className="text-ink hover:text-brand">{a.body}</Link>
                <form action={markAlertReadAction.bind(null, a.id)}><button className="text-xs font-semibold text-muted hover:text-ink">Dismiss</button></form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">Sales</h1>
          <PendingLink href="/sales/deals/new" className="btn btn-primary shrink-0" data-testid="sales-new-deal">
            <Icon name="plus" />
            <span className="md:hidden">New</span>
            <span className="hidden md:inline">New deal</span>
          </PendingLink>
        </div>
        <div className="mt-0.5 text-muted">
          {pipe?.name ?? "Sales"} · {deals.length} deal{deals.length === 1 ? "" : "s"}{deals.length ? ` · avg ${avg} days open` : ""}
        </div>
      </div>

      <div className="mb-3.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Program">
        {PIPELINE_DEFS.map((p) => {
          const on = p.slug === props.pipeline;
          const n = counts[p.slug] ?? 0;
          return (
            <Link
              key={p.slug}
              href={hrefFor({ pipeline: p.slug })}
              role="tab"
              aria-selected={on}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-brand bg-brand-50 text-brand-700" : "border-line bg-white text-ink"}`}
              data-testid={`sales-pipeline-${p.slug}`}
            >
              <span className="hidden sm:inline">{p.name}</span>
              <span className="sm:hidden">{PIPE_SHORT[p.slug] ?? p.name}</span>
              <span className={`rounded-full px-1.5 text-[11.5px] font-bold ${on ? "bg-white text-brand-700" : "bg-canvas text-muted"}`}>{n}</span>
            </Link>
          );
        })}
      </div>

      <div className="mb-3.5 flex gap-0 overflow-x-auto border-b border-line">
        {VIEWS.map((v) => {
          const active = props.view === v.id;
          const count = v.id === "inbox" && props.inbox.length ? props.inbox.length : undefined;
          return (
            <Link
              key={v.id}
              href={hrefFor({ view: v.id })}
              className={`inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-semibold ${active ? "border-b-2 border-brand text-ink" : "border-b-2 border-transparent text-muted hover:text-ink"}`}
            >
              <span>{v.label}</span>
              {count ? <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold text-[#3b2600]">{count}</span> : null}
            </Link>
          );
        })}
        <Link href="/sales/automations" className="inline-flex shrink-0 items-center px-3.5 py-2 text-[13.5px] font-semibold text-muted hover:text-ink">Automations</Link>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <form className="w-full md:max-w-xs" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") ?? "") }); }}>
          <label className="sr-only" htmlFor="sales-search">Search deals</label>
          <span className="flex w-full items-center gap-2 rounded-lg border border-[#d5dbd4] bg-white px-2.5 py-1.5 text-[13px] text-muted">
            <Icon name="search" className="size-4 shrink-0" />
            <input id="sales-search" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" name="q" defaultValue={props.query} placeholder="Search deals, customers, addresses" />
          </span>
        </form>
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <label className="sr-only" htmlFor="sales-owner">Owner</label>
          <select id="sales-owner" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] font-semibold" value={props.ownerFilter} onChange={(e) => go({ owner: e.target.value })}>
            <option value="">Owner: All</option>
            {ownerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label className="sr-only" htmlFor="sales-priority">Priority</label>
          <select id="sales-priority" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] font-semibold" value={props.priorityFilter} onChange={(e) => go({ priority: e.target.value })}>
            <option value="">Priority: All</option>
            <option value="High">Priority: High</option>
            <option value="Medium">Priority: Medium</option>
            <option value="Low">Priority: Low</option>
          </select>
        </div>
      </div>

      {props.view === "table" && <SalesPipelineTable deals={deals} stages={pipe?.stages ?? []} owners={props.owners} ownerColors={props.ownerColors} ownerAvatars={props.ownerAvatars} onMoveStage={async (id, stage) => { await moveDealStage(id, stage); router.refresh(); }} />}
      {props.view === "kanban" && <Kanban deals={deals} stages={pipe?.stages ?? []} owners={props.owners} ownerColors={props.ownerColors} ownerAvatars={props.ownerAvatars} />}
      {props.view === "calendar" && <Calendar deals={deals} />}
      {props.view === "aging" && <Aging deals={deals} owners={props.owners} ownerColors={props.ownerColors} ownerAvatars={props.ownerAvatars} />}
      {props.view === "map" && <SalesMap deals={deals} />}
      {props.view === "inbox" && <Inbox items={props.inbox} />}
      {props.view === "dashboard" && <Dash d={props.dashboard} />}
    </div>
  );
}

function Kanban({ deals, stages, owners, ownerColors = {}, ownerAvatars = {} }: { deals: SalesDeal[]; stages: { slug: string; name: string; bg: string; color: string }[]; owners: Record<string, string>; ownerColors?: Record<string, string>; ownerAvatars?: Record<string, string | null> }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((s) => {
        const cols = deals.filter((d) => d.stage_slug === s.slug);
        return (
          <div key={s.slug} className="flex w-[240px] shrink-0 flex-col rounded-xl border border-line bg-canvas">
            <div className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="text-[12.5px] font-bold leading-tight" style={{ color: s.color }}>{s.name}</div>
              <span className="text-xs font-semibold text-muted">{cols.length}</span>
            </div>
            <div className="flex flex-col gap-2 px-2 pb-2">
              {cols.map((d) => (
                <div key={d.id} className="card p-3">
                  <Link href={`/sales/deals/${d.id}`} className="font-semibold hover:text-brand">{d.title}</Link>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    {d.owner_id ? <Avatar name={owners[d.owner_id] ?? "Unknown"} color={ownerColors[d.owner_id] ?? "#0f766e"} size="sm" src={ownerAvatars[d.owner_id]} /> : null}
                    <span>{d.contact_name} · {owners[d.owner_id ?? ""] ?? "Unassigned"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Pri p={d.priority} />
                    <form action={moveDealStage.bind(null, d.id, "contacted_comed")} className="hidden" />
                    <span className="text-xs text-muted">{d.value ? money(d.value) : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Calendar({ deals }: { deals: SalesDeal[] }) {
  const dated = deals.filter((d) => d.assessment_date).sort((a, b) => (a.assessment_date ?? "").localeCompare(b.assessment_date ?? ""));
  return (
    <div className="card divide-y divide-line">
      {dated.length === 0 && <div className="p-8 text-center text-sm text-muted">No assessment dates on the calendar yet.</div>}
      {dated.map((d) => (
        <Link key={d.id} href={`/sales/deals/${d.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[#fafbf9]">
          <div className="w-24 shrink-0 text-sm font-semibold text-muted">{fmtDay(d.assessment_date)}</div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{d.title}</div>
            <div className="text-xs text-muted">{d.contact_name} · {d.city}</div>
          </div>
          <StagePill pipeline={d.pipeline_slug} stage={d.stage_slug} />
        </Link>
      ))}
    </div>
  );
}

function Aging({ deals, owners, ownerColors = {}, ownerAvatars = {} }: { deals: SalesDeal[]; owners: Record<string, string>; ownerColors?: Record<string, string>; ownerAvatars?: Record<string, string | null> }) {
  const rows = [...deals].sort((a, b) => dealLengthDays(b) - dealLengthDays(a));
  return (
    <div className="card divide-y divide-line">
      {rows.map((d) => {
        const days = dealLengthDays(d);
        const tone = days >= 21 ? "bg-rose-400" : days >= 14 ? "bg-amber-400" : "bg-brand";
        return (
          <Link key={d.id} href={`/sales/deals/${d.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[#fafbf9]">
            <div className="w-16 shrink-0 text-right text-sm font-bold">{days}d</div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, (days / 40) * 100)}%` }} />
            </div>
            <div className="w-48 min-w-0">
              <div className="truncate font-semibold">{d.title}</div>
              <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                {d.owner_id ? <Avatar name={owners[d.owner_id] ?? "Unknown"} color={ownerColors[d.owner_id] ?? "#0f766e"} size="sm" src={ownerAvatars[d.owner_id]} /> : null}
                <span className="truncate">{owners[d.owner_id ?? ""] ?? "Unassigned"}</span>
              </div>
            </div>
            <StagePill pipeline={d.pipeline_slug} stage={d.stage_slug} />
          </Link>
        );
      })}
    </div>
  );
}

function Inbox({ items }: { items: SalesInboxItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">New leads land here from the public web form, inbound email, and the xAgent webhook. Accepting one opens a Potential Lead deal — nothing is sent to the customer automatically.</p>
      {items.length === 0 && <div className="card p-8 text-center text-sm text-muted">Inbox is clear.</div>}
      {items.map((i) => (
        <div key={i.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{i.name}</div>
              <div className="text-sm text-muted">{[i.address, i.city, i.state, i.zip].filter(Boolean).join(", ")}</div>
              <div className="mt-1 text-xs text-muted">{i.source.replace("_", " ")} · {i.phone || i.email || "no contact"}</div>
              {i.message && <p className="mt-2 whitespace-pre-wrap text-sm">{i.message}</p>}
            </div>
            <div className="flex gap-2">
              <form action={acceptInboxAction.bind(null, i.id)}><button className="btn btn-primary">Accept</button></form>
              <form action={dismissInboxAction.bind(null, i.id)}><button className="btn">Dismiss</button></form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Dash({ d }: { d: Dashboard }) {
  const max = Math.max(1, ...d.funnel.map((f) => f.count));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-3 font-semibold">Funnel — {d.pipelineName}</div>
        <div className="flex flex-col gap-2">
          {d.funnel.map((f) => (
            <div key={f.slug} className="flex items-center gap-3 text-sm">
              <div className="w-44 shrink-0 truncate text-muted">{f.name}</div>
              <div className="h-5 flex-1 overflow-hidden rounded bg-line">
                <div className="h-full bg-brand" style={{ width: `${(f.count / max) * 100}%` }} />
              </div>
              <div className="w-8 text-right font-semibold">{f.count}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <div className="card p-4"><div className="text-xs font-bold uppercase text-muted">Open pipeline</div><div className="text-2xl font-bold">{d.openDeals} deals</div><div className="text-sm text-muted">{d.openValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</div></div>
        <div className="card p-4"><div className="text-xs font-bold uppercase text-muted">Won</div><div className="text-2xl font-bold">{d.won}</div></div>
        <div className="card p-4"><div className="text-xs font-bold uppercase text-muted">Lost / declined</div><div className="text-2xl font-bold">{d.lost}</div></div>
      </div>
      <div className="card overflow-x-auto p-4">
        <div className="mb-3 font-semibold">Win rate by rep</div>
        <table className="w-full text-left text-sm">
          <thead className="text-[11.5px] font-bold uppercase text-muted"><tr><th className="py-1">Rep</th><th>Open</th><th>Won</th><th>Win rate</th><th className="text-right">Pipeline</th></tr></thead>
          <tbody>{d.reps.map((r) => (
            <tr key={r.owner_id} className="border-t border-line"><td className="py-2 font-semibold">{r.name}</td><td>{r.open}</td><td>{r.won}</td><td>{Math.round(r.winRate * 100)}%</td><td className="text-right">{r.pipelineValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card p-4">
        <div className="mb-3 font-semibold">Average days in stage</div>
        <div className="flex flex-col gap-1.5 text-sm">
          {d.stageTime.filter((s) => s.count).map((s) => (
            <div key={s.slug} className="flex justify-between gap-3"><span className="text-muted">{s.name}</span><span className="font-semibold">{s.avgDays}d <span className="font-normal text-muted">({s.count})</span></span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
