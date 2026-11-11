"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { JOB_BAR, JobKindBadge, JobStatusPill, KIND_BAR } from "@/components/status";
import { addDays, dayKey, fmtDay, fmtMinutes, fmtTime, minutesOfDay } from "@/lib/time";
import type { JobView, Person } from "@/lib/types";
import { moveJob } from "../jobs/actions";

export type View = "day" | "week" | "month";
type Row = Person & { role: string };
const DAY_START = 6 * 60, DAY_END = 20 * 60, SNAP = 30;
const UNASSIGNED = "__none";

export function ScheduleBoard(props: { view: View; date: string; start: string; days: number; tech: string; today: string; staff: boolean; people: Row[]; rows: Row[]; jobs: JobView[]; conflicted: string[] }) {
  const { view, date, start, days, tech, today, staff, people, rows, jobs } = props;
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false); // while dragging, chips let drops fall through to the cell under them
  const conflicted = new Set(props.conflicted);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const q = (o: Partial<{ view: View; date: string; tech: string }>) => {
    const p = new URLSearchParams({ view: o.view ?? view, date: o.date ?? date, ...((o.tech ?? tech) ? { tech: o.tech ?? tech } : {}) });
    return `/schedule?${p}`;
  };
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const prev = step ? addDays(date, -step) : addDays(date.slice(0, 8) + "01", -1).slice(0, 8) + "01";
  const next = step ? addDays(date, step) : addDays(date.slice(0, 8) + "28", 7).slice(0, 8) + "01";
  const title = view === "day" ? fmtDay(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : view === "week" ? `${fmtDay(start, { month: "short", day: "numeric" })} – ${fmtDay(addDays(start, 6), { month: "short", day: "numeric", year: "numeric" })}`
    : fmtDay(date, { month: "long", year: "numeric" });
  const unassigned = jobs.filter((j) => !j.assignees.length);
  const boardRows: Row[] = [...rows, ...(staff && unassigned.length ? [{ id: UNASSIGNED, full_name: "Unassigned", color: "#94a3b8", role: "" }] : [])];
  const jobsFor = (rowId: string, day?: string) => jobs.filter((j) => (rowId === UNASSIGNED ? !j.assignees.length : j.assignees.some((a) => a.id === rowId)) && (!day || dayKey(j.starts_at) === day));
  const draggable = (j: JobView) => staff && j.status !== "approved" && j.status !== "cancelled";

  async function drop(e: DragEvent, target: { day: string; row?: string; startMin?: number }) {
    e.preventDefault(); setOver(null); setDragging(false);
    const raw = e.dataTransfer.getData("application/x-rr-job");
    if (!raw) return;
    const { jobId, from, grabMin } = JSON.parse(raw) as { jobId: string; from: string | null; grabMin: number };
    const input = {
      jobId, day: target.day,
      startMin: target.startMin !== undefined ? Math.max(DAY_START, Math.round((target.startMin - grabMin) / SNAP) * SNAP) : null,
      ...(target.row !== undefined ? { from: from === UNASSIGNED ? null : from, to: target.row === UNASSIGNED ? null : target.row } : {}),
    };
    setMsg({ tone: "ok", text: "Saving…" });
    let res = await moveJob(input);
    if ("conflicts" in res) {
      if (!window.confirm(`Double-booking:\n\n${res.conflicts.join("\n")}\n\nMove anyway?`)) { setMsg(null); return; }
      res = await moveJob({ ...input, force: true });
    }
    setMsg("error" in res ? { tone: "error", text: res.error } : "conflicts" in res ? null : { tone: "ok", text: "Visit moved." });
    startT(() => router.refresh());
  }
  const dropProps = (key: string, target: Parameters<typeof drop>[1] | ((e: DragEvent) => Parameters<typeof drop>[1])) => staff ? {
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== key) setOver(key); },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: DragEvent) => drop(e, typeof target === "function" ? target(e) : target),
    "data-drop": key,
  } : {};

  function Chip({ j, row, compact = false, inline = false, style }: { j: JobView; row?: string; compact?: boolean; inline?: boolean; style?: React.CSSProperties }) {
    const c = conflicted.has(j.id);
    const lead = j.assignees[0];
    return (
      <Link href={`/jobs/${j.id}`} draggable={draggable(j)} data-job={j.id} style={style} title={`${j.title} · ${j.customer_name}${c ? " · DOUBLE-BOOKED" : ""}`}
        onDragStart={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const track = (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement | null;
          const grabMin = track && view === "day" ? ((e.clientX - rect.left) / track.getBoundingClientRect().width) * (DAY_END - DAY_START) : 0;
          e.dataTransfer.setData("application/x-rr-job", JSON.stringify({ jobId: j.id, from: row ?? null, grabMin }));
          e.dataTransfer.effectAllowed = "move";
          requestAnimationFrame(() => setDragging(true));
        }}
        onDragEnd={() => { setDragging(false); setOver(null); }}
        className={`block overflow-hidden rounded-md border border-l-4 bg-white px-2 py-1 text-left text-[11.5px] leading-tight shadow-sm hover:shadow ${JOB_BAR[j.status]} ${KIND_BAR[j.kind ?? "install"]} ${c ? "border-red-400 ring-2 ring-red-300" : "border-line"} ${draggable(j) ? "cursor-grab active:cursor-grabbing" : ""} ${j.status === "approved" ? "opacity-70" : ""}`}>
        {inline ? <div className="flex items-center gap-1 truncate">{c && <Icon name="alert" className="size-3 text-red-600" />}<span className="font-semibold text-muted">{fmtTime(j.starts_at)}</span><span className="truncate font-semibold text-ink">{j.title}</span></div> : <>
        <div className="flex items-center gap-1 font-semibold text-muted">{c && <Icon name="alert" className="size-3 text-red-600" />}{fmtTime(j.starts_at)}{!compact && `–${fmtTime(j.ends_at)}`}{view === "month" && lead && <span className="ml-auto size-2 rounded-full" style={{ background: lead.color }} />}</div>
        <div className="truncate font-semibold text-ink">{j.title}</div>
        {!compact && <div className="truncate text-muted">{j.customer_name}</div>}
        {j.kind && j.kind !== "install" && <div className="mt-0.5"><JobKindBadge kind={j.kind} size="sm" /></div>}</>}
      </Link>
    );
  }

  const agenda = (
    <div className="flex flex-col gap-3" data-testid="agenda">
      {dayList.filter((d) => view !== "month" || d.slice(0, 7) === date.slice(0, 7)).map((d) => {
        const list = jobs.filter((j) => dayKey(j.starts_at) === d);
        if (!list.length && d !== today) return null;
        return (
          <div key={d}>
            <div className={`mb-1.5 text-[13px] font-bold ${d === today ? "text-brand" : "text-muted"}`}>{fmtDay(d, { weekday: "long", month: "short", day: "numeric" })}{d === today && " · Today"}</div>
            <div className="card divide-y divide-line">
              {!list.length && <div className="p-4 text-sm text-muted">Nothing scheduled.</div>}
              {list.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className={`flex items-center gap-3 border-l-4 px-3 py-3 ${JOB_BAR[j.status]} ${KIND_BAR[j.kind ?? "install"]}`}>
                  <div className="w-16 shrink-0 text-[12px] font-semibold text-muted">{fmtTime(j.starts_at)}<br />{fmtTime(j.ends_at)}</div>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{j.title}</div><div className="truncate text-[12.5px] text-muted">{j.customer_name}{j.address ? ` · ${j.address.split(" ").slice(-3, -2)[0] ?? ""}` : ""}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><JobKindBadge kind={j.kind} size="sm" /><JobStatusPill status={j.status} />{conflicted.has(j.id) && <span className="pill bg-red-50 text-red-700"><Icon name="alert" className="size-3" />Double-booked</span>}</div></div>
                  <span className="flex shrink-0 -space-x-1.5">{j.assignees.slice(0, 3).map((a) => <span key={a.id} className="rounded-full ring-2 ring-white"><Avatar name={a.full_name} color={a.color} size="sm" src={a.avatar_url} /></span>)}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);
  const pct = (m: number) => `${((Math.min(Math.max(m, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START)) * 100}%`;

  return (
    <div className={dragging ? "[&_a[data-job]]:pointer-events-none" : ""}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[22px] font-semibold tracking-tight">{staff ? "Schedule" : "My schedule"}</h1>
        {staff && <Link href={`/jobs/new?date=${date}`} className="btn btn-primary"><Icon name="plus" />New visit</Link>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-white p-0.5" role="tablist">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Link key={v} href={q({ view: v })} role="tab" aria-selected={v === view} className={`rounded-md px-3 py-1.5 text-[13px] font-semibold capitalize ${v === view ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>{v}</Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={q({ date: prev })} className="btn btn-sm" aria-label="Previous"><Icon name="left" className="size-4" /></Link>
          <Link href={q({ date: today })} className="btn btn-sm">Today</Link>
          <Link href={q({ date: next })} className="btn btn-sm" aria-label="Next"><Icon name="right" className="size-4" /></Link>
        </div>
        <div className="font-semibold">{title}</div>
        {staff && (
          <select className="input ml-auto !w-auto !py-1.5" aria-label="Filter by tech" value={tech} onChange={(e) => router.push(q({ tech: e.target.value }))}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>
      {msg && <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.tone === "ok" ? "bg-green-100 text-green-900" : "bg-red-50 text-red-800"}`} role="status">{pending ? "Updating…" : msg.text}</div>}
      {staff && <p className="mb-2 hidden text-xs text-muted md:block">Drag a visit to another day{view === "day" ? ", time" : ""} or tech to reschedule or reassign. Red outline = double-booked.</p>}

      {/* phones + techs: agenda list (tap a visit to open / edit it) */}
      <div className={staff ? "md:hidden" : ""}>{agenda}</div>

      {staff && view === "week" && (
        <div className="card hidden overflow-x-auto md:block" data-testid="week-board">
          <div className="grid min-w-[980px] grid-cols-[170px_repeat(7,minmax(0,1fr))]">
            <div className="border-b border-line bg-canvas/60 p-2 text-xs font-semibold text-muted">Crew</div>
            {dayList.map((d) => <div key={d} className={`border-b border-l border-line p-2 text-center text-xs font-semibold ${d === today ? "bg-brand-50 text-brand" : "bg-canvas/60 text-muted"}`}>{fmtDay(d)}</div>)}
            {boardRows.map((r) => (
              <div key={r.id} className="contents">
                <div className="flex items-center gap-2 border-b border-line p-2 text-sm font-semibold"><Avatar name={r.full_name} color={r.color} size="sm" src={r.avatar_url} /><span className="truncate">{r.full_name}</span></div>
                {dayList.map((d) => {
                  const key = `${r.id}|${d}`;
                  return (
                    <div key={d} {...dropProps(key, { day: d, row: r.id })} className={`group relative flex min-h-[86px] flex-col gap-1 border-b border-l border-line p-1 ${over === key ? "bg-brand-50 outline-2 outline-brand" : d === today ? "bg-brand-50/30" : ""}`}>
                      {jobsFor(r.id, d).map((j) => <Chip key={j.id} j={j} row={r.id} />)}
                      {r.id !== UNASSIGNED && <Link href={`/jobs/new?date=${d}&tech=${r.id}`} aria-label={`New visit for ${r.full_name} on ${d}`} className="mt-auto hidden rounded text-center text-xs text-muted hover:bg-white group-hover:block">+</Link>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {staff && view === "day" && (
        <div className="card hidden overflow-x-auto md:block" data-testid="day-board">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[170px_1fr] border-b border-line bg-canvas/60 text-xs font-semibold text-muted">
              <div className="p-2">Crew</div>
              <div className="relative h-8">{hours.map((h) => <span key={h} className="absolute top-2 -translate-x-1/2" style={{ left: pct(h) }}>{fmtMinutes(h)}</span>)}</div>
            </div>
            {boardRows.map((r) => {
              const key = `${r.id}|${date}`;
              return (
                <div key={r.id} className="grid grid-cols-[170px_1fr] border-b border-line">
                  <div className="flex items-center gap-2 p-2 text-sm font-semibold"><Avatar name={r.full_name} color={r.color} size="sm" src={r.avatar_url} /><span className="truncate">{r.full_name}</span></div>
                  <div data-track {...dropProps(key, (e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    return { day: date, row: r.id, startMin: DAY_START + ((e.clientX - rect.left) / rect.width) * (DAY_END - DAY_START) };
                  })} className={`relative h-[74px] ${over === key ? "bg-brand-50" : ""}`}>
                    {hours.map((h) => <span key={h} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: pct(h) }} />)}
                    {(() => {
                      // overlapping visits (double-bookings) stack in lanes instead of covering each other
                      const list = jobsFor(r.id, date).map((j) => ({ j, s: minutesOfDay(j.starts_at), e: dayKey(j.ends_at) === date ? minutesOfDay(j.ends_at) : DAY_END }));
                      const laneEnds: number[] = [];
                      const placed = list.map((x) => { let lane = laneEnds.findIndex((end) => end <= x.s); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = x.e; return { ...x, lane }; });
                      const n = Math.max(1, laneEnds.length), h = 62 / n;
                      return placed.map(({ j, s, e, lane }) => (
                        <Chip key={j.id} j={j} row={r.id} inline={n > 1} style={{ position: "absolute", top: 6 + lane * h, height: h - 2, ...(n > 1 ? { paddingTop: 2, paddingBottom: 2 } : {}), left: pct(s), width: `calc(${pct(e)} - ${pct(s)} - 3px)` }} />
                      ));
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {staff && view === "month" && (
        <div className="card hidden overflow-hidden md:block" data-testid="month-board">
          <div className="grid grid-cols-7">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="border-b border-line bg-canvas/60 p-2 text-center text-xs font-semibold text-muted">{d}</div>)}
            {dayList.map((d) => {
              const list = jobs.filter((j) => dayKey(j.starts_at) === d);
              const key = `m|${d}`;
              return (
                <div key={d} {...dropProps(key, { day: d })} className={`flex min-h-[112px] flex-col gap-1 border-b border-l border-line p-1.5 ${d.slice(0, 7) !== date.slice(0, 7) ? "bg-canvas/50" : ""} ${over === key ? "bg-brand-50 outline-2 outline-brand" : ""}`}>
                  <Link href={q({ view: "day", date: d })} className={`self-start rounded px-1 text-xs font-semibold ${d === today ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>{Number(d.slice(8))}</Link>
                  {list.slice(0, 3).map((j) => <Chip key={j.id} j={j} compact />)}
                  {list.length > 3 && <Link href={q({ view: "day", date: d })} className="text-[11px] font-semibold text-brand">+{list.length - 3} more</Link>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {staff && !jobs.length && <p className="mt-3 hidden text-center text-sm text-muted md:block">No visits in this range{tech ? " for this tech" : ""}.</p>}
    </div>
  );
}
