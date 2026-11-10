import type { JobStatus } from "@/lib/types";

type Addr = { address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
/** "123 Main St Chicago, IL 60601" — same format as the customer and project detail pages. */
export const formatAddress = (c: Addr | null | undefined) =>
  c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";

type JobDates = { starts_at: string; ends_at: string; status: JobStatus; completed_at: string | null };
/**
 * Project dates rolled up from its (non-cancelled) visits:
 * start = earliest visit start; completion = latest completed_at, only once every visit is done.
 */
export function projectDates(jobs: JobDates[]): { start_date: string | null; completed_date: string | null } {
  const live = jobs.filter((j) => j.status !== "cancelled");
  if (!live.length) return { start_date: null, completed_date: null };
  const start = live.map((j) => new Date(j.starts_at).toISOString()).sort()[0];
  const done = live.every((j) => j.status === "completed" || j.status === "approved");
  const completed = done ? live.map((j) => new Date(j.completed_at ?? j.ends_at).toISOString()).sort().at(-1)! : null;
  return { start_date: start, completed_date: completed };
}
