import { fmtTime } from "@/lib/time";
import type { JobStatus } from "@/lib/types";

const MIN = 60_000;

/** Whole minutes, rounded. */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  let minutes = Math.round(safe / MIN);
  const hours = Math.floor(minutes / 60);
  minutes = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function durationMs(fromIso: string, toIsoOrMs: string | number): number {
  const from = new Date(fromIso).getTime();
  const to = typeof toIsoOrMs === "number" ? toIsoOrMs : new Date(toIsoOrMs).getTime();
  return Math.max(0, to - from);
}

/** Minutes the finish is past the scheduled window end (0 if on time or early). Any overrun counts as at least 1. */
export function overWindowMinutes(completedAt: string, endsAt: string): number {
  const over = new Date(completedAt).getTime() - new Date(endsAt).getTime();
  if (over <= 0) return 0;
  return Math.max(1, Math.round(over / MIN));
}

export function overWindowLabel(completedAt: string, endsAt: string): string | null {
  const mins = overWindowMinutes(completedAt, endsAt);
  if (!mins) return null;
  return `${formatDuration(mins * MIN)} over window`;
}

export function inProgressCaption(startedAt: string, now: string | number = Date.now()): string {
  return `Started ${fmtTime(startedAt)} · ${formatDuration(durationMs(startedAt, now))} so far`;
}

export function completedCaption(startedAt: string, completedAt: string): string {
  return `Started ${fmtTime(startedAt)} · Finished ${fmtTime(completedAt)} · took ${formatDuration(durationMs(startedAt, completedAt))}`;
}

export function visitDurationCaption(job: {
  status: JobStatus;
  started_at?: string | null;
  completed_at?: string | null;
}, now: string | number = Date.now()): string | null {
  if (job.status === "in_progress" && job.started_at) return inProgressCaption(job.started_at, now);
  if ((job.status === "completed" || job.status === "approved") && job.started_at && job.completed_at) {
    return completedCaption(job.started_at, job.completed_at);
  }
  return null;
}

export function elapsedLabel(startedAt: string, now: string | number = Date.now()): string {
  return `${formatDuration(durationMs(startedAt, now))} so far`;
}

export function totalLabel(startedAt: string, completedAt: string): string {
  return formatDuration(durationMs(startedAt, completedAt));
}
