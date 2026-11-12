"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { SalesMap } from "@/components/sales/sales-map";
import { PIPELINE_DEFS, stageBySlug, type PipelineSlug } from "@/lib/sales/catalog";
import { dealLengthDays, type SalesAlert, type SalesDeal, type SalesInboxItem } from "@/lib/sales/types";
import type { FunnelRow, RepRow, StageTimeRow } from "@/lib/sales/dashboard";

type Dashboard = { pipelineName: string; openDeals: number; openValue: number; won: number; lost: number; funnel: FunnelRow[]; reps: RepRow[]; stageTime: StageTimeRow[] };
import { acceptInboxAction, dismissInboxAction, markAlertReadAction, moveDealStage } from "./actions";

export type SalesView = "table" | "kanban" | "calendar" | "aging" | "map" | "inbox" | "dashboard";

const VIEWS: { id: SalesView; label: string; short?: string; icon: string; mobile?: boolean }[] = [
  { id: "table", label: "Table", icon: "list", mobile: true },
  { id: "kanban", label: "Kanban", icon: "kanban" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "aging", label: "Aging", icon: "clock" },
  { id: "map", label: "Map", icon: "map", mobile: true },
  { id: "inbox", label: "Inbox", icon: "mail", mobile: true },
  { id: "dashboard", label: "Dashboard", short: "Dash", icon: "funnel", mobile: true },
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

export function SalesWorkspace(props: {
  view: SalesView;
  pipeline: string;
  deals: SalesDeal[];
  inbox: SalesInboxItem[];
  alerts: SalesAlert[];
  owners: Record<string, string>;
  dashboard: Dashboard;
  canDelete: boolean;
  query: string;
}) {
  const router = useRouter();
  const go = (next: Partial<{ view: string; pipeline: string; q: string }>) => {
    const sp = new URLSearchParams();
    const view = next.view ?? props.view;
    const pipeline = next.pipeline ?? props.pipeline;
    const q = next.q ?? props.query;
    if (view !== "table") sp.set("view", view);
    if (pipeline !== "single_family_whe") sp.set("pipeline", pipeline);
    if (q) sp.set("q", q);
    router.push(`/sales${sp.toString() ? `?${sp}` : ""}`);
  };
  const deals = props.deals;
  const pipe = PIPELINE_DEFS.find((p) => p.slug === props.pipeline);

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="sales-pipeline">Pipeline</label>
        <select id="sales-pipeline" className="input w-auto min-w-[12rem]" value={props.pipeline} onChange={(e) => go({ pipeline: e.target.value })}>
          {PIPELINE_DEFS.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); go({ q: new FormData(e.currentTarget).get("q") as string }); }}>
          <input className="input" name="q" defaultValue={props.query} placeholder="Search deals" />
          <button className="btn">Search</button>
        </form>
        <Link href="/sales/automations" className="btn hidden sm:inline-flex"><Icon name="flag" />Automations</Link>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1">
        {VIEWS.map((v) => {
          const hide = !v.mobile ? "hidden md:inline-flex" : "inline-flex";
          const active = props.view === v.id;
          const count = v.id === "inbox" && props.inbox.length ? props.inbox.length : undefined;
          return (
            <button key={v.id} type="button" onClick={() => go({ view: v.id })} className={`${hide} items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold ${active ? "bg-brand-50 text-brand" : "text-muted hover:bg-canvas"}`}>
              <Icon name={v.icon} className="size-4" /><span className="md:hidden">{v.short ?? v.label}</span><span className="hidden md:inline">{v.label}</span>
              {count ? <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold text-[#3b2600]">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {props.view === "table" && <Table deals={deals} owners={props.owners} />}
      {props.view === "kanban" && <Kanban deals={deals} stages={pipe?.stages ?? []} owners={props.owners} />}
      {props.view === "calendar" && <Calendar deals={deals} />}
      {props.view === "aging" && <Aging deals={deals} owners={props.owners} />}
      {props.view === "map" && <SalesMap deals={deals} />}
      {props.view === "inbox" && <Inbox items={props.inbox} />}
      {props.view === "dashboard" && <Dash d={props.dashboard} />}
    </div>
  );
}

function Table({ deals, owners }: { deals: SalesDeal[]; owners: Record<string, string> }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="border-b border-line bg-canvas text-[11.5px] font-bold uppercase tracking-wide text-muted">
          <tr>
            <th className="sticky left-0 bg-canvas px-3 py-2">Deal</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Assess.</th>
            <th className="px-3 py-2">Length</th>
            <th className="px-3 py-2 text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {deals.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No deals in this pipeline yet. LED Lighting and HVAC start empty on purpose.</td></tr>}
          {deals.map((d) => (
            <tr key={d.id} className="hover:bg-[#fafbf9]">
              <td className="sticky left-0 bg-white px-3 py-2">
                <Link href={`/sales/deals/${d.id}`} className="font-semibold text-ink hover:text-brand">{d.title}</Link>
                <div className="text-xs text-muted">{d.contact_name}{d.city ? ` · ${d.city}` : ""}</div>
              </td>
              <td className="px-3 py-2"><StagePill pipeline={d.pipeline_slug} stage={d.stage_slug} /></td>
              <td className="px-3 py-2">{d.owner_id ? owners[d.owner_id] ?? "—" : "Unassigned"}</td>
              <td className="px-3 py-2"><Pri p={d.priority} /></td>
              <td className="px-3 py-2">{fmtDay(d.assessment_date)}</td>
              <td className="px-3 py-2">{dealLengthDays(d)}d</td>
              <td className="px-3 py-2 text-right font-medium">{d.value ? money(d.value) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kanban({ deals, stages, owners }: { deals: SalesDeal[]; stages: { slug: string; name: string; bg: string; color: string }[]; owners: Record<string, string> }) {
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
                  <div className="mt-1 text-xs text-muted">{d.contact_name} · {owners[d.owner_id ?? ""] ?? "Unassigned"}</div>
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

function Aging({ deals, owners }: { deals: SalesDeal[]; owners: Record<string, string> }) {
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
              <div className="truncate text-xs text-muted">{owners[d.owner_id ?? ""] ?? "Unassigned"}</div>
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
