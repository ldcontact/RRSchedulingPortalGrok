import type { JobKind, JobStatus } from "@/lib/types";

type Addr = { address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
/** "123 Main St Chicago, IL 60601" — same format as the customer and project detail pages. */
export const formatAddress = (c: Addr | null | undefined) =>
  c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";

type JobDates = { starts_at: string; ends_at: string; status: JobStatus; completed_at: string | null; kind?: JobKind | null };
/**
 * Project dates rolled up from its (non-cancelled) visits:
 * start = earliest visit start; completion = latest completed_at, only once every visit is done.
 * Only install visits count: warranty/service visits never move a project's dates.
 */
export function projectDates(jobs: JobDates[]): { start_date: string | null; completed_date: string | null } {
  const live = jobs.filter((j) => j.status !== "cancelled" && (j.kind ?? "install") === "install");
  if (!live.length) return { start_date: null, completed_date: null };
  const start = live.map((j) => new Date(j.starts_at).toISOString()).sort()[0];
  const done = live.every((j) => j.status === "completed" || j.status === "approved");
  const completed = done ? live.map((j) => new Date(j.completed_at ?? j.ends_at).toISOString()).sort().at(-1)! : null;
  return { start_date: start, completed_date: completed };
}

/** Add whole calendar months to an instant (same as Postgres `+ make_interval(months => n)`, end-of-month clamped). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString();
}

/** Warranty for a ticket: judged on the day the customer reported it; mirrors public.service_request_list. */
export function warrantyFor(completedAt: string | null, months: number | null, receivedAt: string): { state: "in" | "out" | "unknown"; expires: string | null } {
  if (!completedAt || months == null) return { state: "unknown", expires: null };
  const expires = addMonths(completedAt, months);
  return { state: new Date(receivedAt) <= new Date(expires) ? "in" : "out", expires };
}

/** "1 yr 7 mo" between two instants (whole months, floor). */
export function ageText(fromIso: string, toIso: string = new Date().toISOString()): string {
  const a = new Date(fromIso), b = new Date(toIso);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  if (m < 1) {
    const days = Math.max(0, Math.floor((b.getTime() - a.getTime()) / 864e5));
    return days === 1 ? "1 day" : `${days} days`;
  }
  const y = Math.floor(m / 12), mo = m % 12;
  return [y ? `${y} yr` : "", mo ? `${mo} mo` : ""].filter(Boolean).join(" ");
}
