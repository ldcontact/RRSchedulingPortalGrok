"use client";

import { useEffect, useState } from "react";
import type { JobStatus } from "@/lib/types";
import { elapsedLabel, overWindowLabel, totalLabel, visitDurationCaption } from "@/lib/visit-duration";

export function VisitDurationLine({
  status,
  startedAt,
  completedAt,
  endsAt,
  className = "",
}: {
  status: JobStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  endsAt?: string | null;
  className?: string;
}) {
  const live = status === "in_progress" && !!startedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [live]);
  const caption = visitDurationCaption({ status, started_at: startedAt, completed_at: completedAt }, now);
  const over = (status === "completed" || status === "approved") && completedAt && endsAt
    ? overWindowLabel(completedAt, endsAt)
    : null;
  if (!caption && !over) return null;
  const tone = status === "in_progress" ? "text-green-700" : "text-muted";
  return (
    <div className={className} data-testid="visit-duration">
      {caption && (
        <div className={`text-[13px] font-semibold ${tone}`}>
          {caption.split(" · ").map((part, i) => (
            <span key={part} className="whitespace-nowrap">{i ? " · " : ""}{part}</span>
          ))}
        </div>
      )}
      {over && <div className="text-[12px] font-semibold text-amber-700">{over}</div>}
    </div>
  );
}

/** Duration only (for the visit detail Timing card). Counts up while in progress. */
export function VisitTimingDuration({
  status,
  startedAt,
  completedAt,
  endsAt,
}: {
  status: JobStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  endsAt?: string | null;
}) {
  const live = status === "in_progress" && !!startedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [live]);
  const over = (status === "completed" || status === "approved") && completedAt && endsAt
    ? overWindowLabel(completedAt, endsAt)
    : null;
  const duration = live && startedAt
    ? elapsedLabel(startedAt, now)
    : startedAt && completedAt
      ? totalLabel(startedAt, completedAt)
      : null;
  if (!duration && !over) return null;
  return (
    <div data-testid="visit-timing-duration">
      {duration && <div className={`font-semibold ${live ? "text-green-700" : ""}`}>{duration}</div>}
      {over && <div className="text-[12.5px] font-semibold text-amber-700">{over}</div>}
    </div>
  );
}
