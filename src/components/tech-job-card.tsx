import Link from "next/link";
import { Icon } from "./icons";
import { AvatarStack, JobKindBadge, JobStatusPill } from "./status";
import { dayKey, fmtDay, fmtRange } from "@/lib/time";
import type { JobView } from "@/lib/types";
import { VisitDurationLine } from "./visit-duration-line";
import { startedByCaption } from "@/lib/started-by";

/** Full My Jobs visit card (Overdue, Today, and Coming up share this). */
export function TechJobCard({ j, overdue = false, overdueCaption }: { j: JobView; overdue?: boolean; overdueCaption?: string }) {
  const cta = j.status === "scheduled" ? "Open & start" : j.status === "in_progress" ? "Continue" : "View";
  const accent = overdue ? "border-l-4 border-l-red-600" : j.kind !== "install" ? "border-l-4 border-l-amber-500" : "";
  const startedBy = j.status === "in_progress" ? startedByCaption(j.started_by, j.assignees) : null;
  return (
    <Link href={`/jobs/${j.id}`} className={`card block p-4 active:bg-[#fafbf9] ${accent}`} data-kind={j.kind} data-overdue={overdue ? "true" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 text-[13px] font-semibold text-muted">
          <span className="whitespace-nowrap">{fmtDay(dayKey(j.starts_at))}</span>
          <span className="whitespace-nowrap"> · {fmtRange(j.starts_at, j.ends_at)}</span>
        </div>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <JobKindBadge kind={j.kind} />
          {overdue ? <span className="pill bg-red-50 text-red-700" data-testid="overdue-badge">Overdue · not started</span> : <JobStatusPill status={j.status} />}
        </span>
      </div>
      <VisitDurationLine className="mt-1" status={j.status} startedAt={j.started_at} completedAt={j.completed_at} endsAt={j.ends_at} />
      {startedBy && (
        <div className="mt-0.5 text-[13px] text-muted">{startedBy}</div>
      )}
      <div className="mt-1 text-[16px] font-semibold">{j.title}</div>
      <div className="text-sm text-muted">{j.customer_name}</div>
      {j.address && (
        <div className="mt-1 flex items-start gap-1.5 text-[13px] text-muted">
          <Icon name="pin" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{j.address}</span>
        </div>
      )}
      {overdue && overdueCaption && (
        <div className="mt-1.5 text-[13px] font-semibold text-red-700">{overdueCaption}</div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <AvatarStack people={j.assignees} />
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
          {cta}
          <Icon name="right" className="size-4" />
        </span>
      </div>
    </Link>
  );
}
