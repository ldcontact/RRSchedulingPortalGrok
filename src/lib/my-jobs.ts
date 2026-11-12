import type { JobStatus } from "@/lib/types";
import { dayKey } from "@/lib/time";

export type MyJobsBucket = "today" | "upcoming" | "submitted";

export type MyJobsInput = {
  starts_at: string;
  status: JobStatus;
  review_note?: string | null;
};

/** Where an assigned visit appears on tech My Jobs. Cancelled visits are omitted. */
export function myJobsBucket(job: MyJobsInput, today: string): MyJobsBucket | null {
  if (job.status === "cancelled") return null;
  if (job.status === "in_progress") return "today";
  if (job.status === "completed" || job.status === "approved") return "submitted";
  // scheduled: overdue and today's visits belong on Today; later dates stay in Coming up.
  return dayKey(job.starts_at) > today ? "upcoming" : "today";
}

/** Live (non-cancelled) visits on one project — used by the customer Projects tab. */
export function liveVisitsForProject<T extends { project_id: string; status: JobStatus }>(visits: T[], projectId: string): T[] {
  return visits.filter((j) => j.project_id === projectId && j.status !== "cancelled");
}

export function partitionMyJobs<T extends MyJobsInput>(jobs: T[], today: string): {
  today: T[];
  upcoming: T[];
  submitted: T[];
  sentBack: T[];
} {
  const buckets: Record<MyJobsBucket, T[]> = { today: [], upcoming: [], submitted: [] };
  for (const j of jobs) {
    const b = myJobsBucket(j, today);
    if (b) buckets[b].push(j);
  }
  const byStart = (a: T, b: T) => a.starts_at.localeCompare(b.starts_at);
  // In-progress first (including a visit started early, before its scheduled day), then by start time.
  buckets.today.sort((a, b) => {
    if ((a.status === "in_progress") !== (b.status === "in_progress")) return a.status === "in_progress" ? -1 : 1;
    return byStart(a, b);
  });
  buckets.upcoming.sort(byStart);
  buckets.submitted.sort(byStart);
  return {
    today: buckets.today,
    upcoming: buckets.upcoming,
    submitted: buckets.submitted,
    sentBack: buckets.today.filter((j) => j.status === "in_progress" && !!j.review_note),
  };
}
