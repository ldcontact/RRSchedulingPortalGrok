import Link from "next/link";
import { Icon } from "./icons";
import { AvatarStack, JobStatusPill } from "./status";
import { fmtRange } from "@/lib/time";
import type { JobView } from "@/lib/types";

/** Full My Jobs visit card (Today + Coming up share this). */
export function TechJobCard({ j }: { j: JobView }) {
  const cta = j.status === "scheduled" ? "Open & start" : j.status === "in_progress" ? "Continue" : "View";
  return (
    <Link href={`/jobs/${j.id}`} className="card block p-4 active:bg-[#fafbf9]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-semibold text-muted">{fmtRange(j.starts_at, j.ends_at)}</div>
        <JobStatusPill status={j.status} />
      </div>
      <div className="mt-1 text-[16px] font-semibold">{j.title}</div>
      <div className="text-sm text-muted">{j.customer_name}</div>
      {j.address && (
        <div className="mt-1 flex items-start gap-1.5 text-[13px] text-muted">
          <Icon name="pin" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{j.address}</span>
        </div>
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
