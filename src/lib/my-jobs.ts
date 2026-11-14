import type { JobStatus } from "@/lib/types";
import { addDays, dayKey, fmtDay, zonedToUtc } from "@/lib/time";

export type MyJobsBucket = "overdue" | "today" | "upcoming" | "submitted";

export type MyJobsInput = {
  starts_at: string;
  status: JobStatus;
  review_note?: string | null;
};

/** Calendar-day difference (b - a) for YYYY-MM-DD keys in the business time zone. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Scheduled (not started) and the scheduled calendar day is before today in Central time. */
export function isOverdueNotStarted(job: MyJobsInput, today: string): boolean {
  return job.status === "scheduled" && dayKey(job.starts_at) < today;
}

export function overdueCaption(startsAt: string, today: string): string {
  const days = daysBetween(dayKey(startsAt), today);
  const overdue = days === 1 ? "1 day overdue" : `${days} days overdue`;
  return `Was scheduled ${fmtDay(dayKey(startsAt))} · ${overdue}`;
}

/** Where an assigned visit appears on tech My Jobs. Cancelled visits are omitted. */
export function myJobsBucket(job: MyJobsInput, today: string): MyJobsBucket | null {
  if (job.status === "cancelled") return null;
  if (job.status === "in_progress") return "today";
  if (job.status === "completed" || job.status === "approved") return "submitted";
  // scheduled: past not-started visits are Overdue; today stays on Today; later dates stay in Coming up.
  const day = dayKey(job.starts_at);
  if (day < today) return "overdue";
  if (day > today) return "upcoming";
  return "today";
}

/** Live (non-cancelled) visits on one project — used by the customer Projects tab. */
export function liveVisitsForProject<T extends { project_id: string; status: JobStatus }>(visits: T[], projectId: string): T[] {
  return visits.filter((j) => j.project_id === projectId && j.status !== "cancelled");
}

export function partitionMyJobs<T extends MyJobsInput>(jobs: T[], today: string): {
  overdue: T[];
  today: T[];
  upcoming: T[];
  submitted: T[];
  sentBack: T[];
} {
  const buckets: Record<MyJobsBucket, T[]> = { overdue: [], today: [], upcoming: [], submitted: [] };
  for (const j of jobs) {
    const b = myJobsBucket(j, today);
    if (b) buckets[b].push(j);
  }
  const byStart = (a: T, b: T) => a.starts_at.localeCompare(b.starts_at);
  // Oldest overdue first (most days outstanding).
  buckets.overdue.sort(byStart);
  // In-progress first (including a visit started early, before its scheduled day), then by start time.
  buckets.today.sort((a, b) => {
    if ((a.status === "in_progress") !== (b.status === "in_progress")) return a.status === "in_progress" ? -1 : 1;
    return byStart(a, b);
  });
  buckets.upcoming.sort(byStart);
  buckets.submitted.sort(byStart);
  return {
    overdue: buckets.overdue,
    today: buckets.today,
    upcoming: buckets.upcoming,
    submitted: buckets.submitted,
    sentBack: buckets.today.filter((j) => j.status === "in_progress" && !!j.review_note),
  };
}

type MyJobsListFilter = { from?: string; assignee?: string; status?: JobStatus[] };

/**
 * Active assigned visits (scheduled + in_progress, no lower date bound) plus
 * completed/approved from the last 7 days for Recently submitted.
 * A single `from: today-7` window used to hide overdue scheduled visits older than a week
 * and could also truncate Coming up if older history filled the 1,000-row cap.
 */
export async function listMyJobsVisits<T extends MyJobsInput>(
  repo: { listJobs: (f?: MyJobsListFilter) => Promise<T[]> },
  userId: string,
  today: string,
): Promise<T[]> {
  const [active, recent] = await Promise.all([
    repo.listJobs({ assignee: userId, status: ["scheduled", "in_progress"] }),
    repo.listJobs({ from: zonedToUtc(addDays(today, -7), 0), assignee: userId, status: ["completed", "approved"] }),
  ]);
  return [...active, ...recent];
}
