import type { JobKind, JobStatus, Person, ServiceRequestView, TicketVisitCrew } from "@/lib/types";
import { dayKey, fmtDay, fmtTime, timeKey, todayKey, addDays } from "@/lib/time";

/** "Today 9:14am", "Mon 4:22pm" (this week), "Nov 5" (this year), "Nov 5, 2025". */
export function fmtReceived(iso: string) {
  const d = dayKey(iso), T = todayKey();
  if (d === T) return `Today ${fmtTime(iso)}`;
  if (d === addDays(T, -1)) return `Yesterday ${fmtTime(iso)}`;
  if (d > addDays(T, -7)) return `${fmtDay(d, { weekday: "short" })} ${fmtTime(iso)}`;
  return d.slice(0, 4) === T.slice(0, 4) ? fmtDay(d, { month: "short", day: "numeric" }) : fmtDay(d, { month: "short", day: "numeric", year: "numeric" });
}
export const fmtMonthYear = (iso: string) => fmtDay(dayKey(iso), { month: "short", year: "numeric" });
export const fmtDate = (iso: string) => fmtDay(dayKey(iso), { month: "short", day: "numeric", year: "numeric" });
/** Value for <input type="datetime-local"> in the business time zone. */
export const localInput = (iso: string) => `${dayKey(iso)}T${timeKey(iso)}`;

/** Suggested visit type + title for a ticket: warranty unless it's out of warranty or already billable. */
export function visitDefaults(sr: Pick<ServiceRequestView, "warranty_state" | "billable" | "summary">): { kind: JobKind; title: string } {
  const kind: JobKind = sr.warranty_state === "out" || sr.billable ? "service" : "warranty";
  return { kind, title: `${kind === "warranty" ? "Warranty" : "Service"} — ${sr.summary}`.slice(0, 120) };
}

/** Office owner for a new ticket: the person who logged it, unless a staff assignee was explicitly chosen. */
export function resolveNewTicketAssignee(
  explicitId: string | null | undefined,
  creator: { id: string; name: string },
  staff: { id: string; full_name: string }[] = [],
): { id: string; name: string } | { error: string } {
  const chosen = explicitId?.trim() ?? "";
  if (!chosen) {
    if (!creator.id) return { error: "Not signed in." };
    return { id: creator.id, name: creator.name };
  }
  const who = staff.find((p) => p.id === chosen);
  if (!who) return { error: "Pick an admin or manager." };
  return { id: who.id, name: who.full_name };
}

const LIVE_VISIT = new Set<JobStatus>(["scheduled", "in_progress"]);

/** Next upcoming live visit (soonest scheduled/in-progress), or the latest non-cancelled visit if none are upcoming. */
export function pickTicketVisit<T extends { starts_at: string; status: string; job_id: string }>(visits: T[]): T | null {
  const tie = (a: T, b: T) => a.job_id.localeCompare(b.job_id);
  const active = visits.filter((j) => j.status !== "cancelled");
  const live = active
    .filter((j) => LIVE_VISIT.has(j.status as JobStatus))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || tie(a, b));
  if (live[0]) return live[0];
  return active.slice().sort((a, b) => b.starts_at.localeCompare(a.starts_at) || tie(b, a))[0] ?? null;
}

/** Office owner first, then visit techs, with role tooltips. Same person in both roles is shown once. */
export function ticketAssigneeStack(office: Person[], techs: Person[]): (Person & { title: string })[] {
  const out: (Person & { title: string })[] = [];
  const seen = new Set<string>();
  for (const p of office) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const alsoTech = techs.some((t) => t.id === p.id);
    out.push({ ...p, title: alsoTech ? `Office & Tech: ${p.full_name}` : `Office: ${p.full_name}` });
  }
  for (const p of techs) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ ...p, title: `Tech: ${p.full_name}` });
  }
  return out;
}

/** Attach the chosen visit + crew to each ticket. `visits` is the full set for this page (one batched lookup). */
export function applyTicketVisits<T extends { id: string }>(
  tickets: T[],
  visits: (TicketVisitCrew & { request_id: string })[],
): (T & { visit: TicketVisitCrew | null })[] {
  const byReq = new Map<string, (TicketVisitCrew & { request_id: string })[]>();
  for (const v of visits) {
    const list = byReq.get(v.request_id) ?? [];
    list.push(v);
    byReq.set(v.request_id, list);
  }
  return tickets.map((t) => {
    const picked = pickTicketVisit(byReq.get(t.id) ?? []);
    const visit = picked ? { job_id: picked.job_id, starts_at: picked.starts_at, status: picked.status, kind: picked.kind, techs: picked.techs } : null;
    return { ...t, visit };
  });
}
