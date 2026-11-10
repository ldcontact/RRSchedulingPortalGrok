"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { dayKey, fmtDay, fmtRange } from "@/lib/time";
import type { JobView } from "@/lib/types";

const PAGE = 50;

type Row =
  | { kind: "month"; key: string; label: string }
  | { kind: "day"; key: string; label: string }
  | { kind: "job"; key: string; job: JobView };

function buildRows(jobs: JobView[]): Row[] {
  const sorted = [...jobs].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const rows: Row[] = [];
  let lastMonth = "";
  let lastDay = "";
  for (const j of sorted) {
    const day = dayKey(j.starts_at);
    const month = day.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      rows.push({ kind: "month", key: `m-${month}`, label: fmtDay(day, { month: "long", year: "numeric" }) });
      lastDay = "";
    }
    if (day !== lastDay) {
      lastDay = day;
      rows.push({ kind: "day", key: `d-${day}`, label: fmtDay(day, { weekday: "short", month: "short", day: "numeric" }) });
    }
    rows.push({ kind: "job", key: j.id, job: j });
  }
  return rows;
}

export function ComingUpList({ jobs }: { jobs: JobView[] }) {
  const [limit, setLimit] = useState(PAGE);
  const allRows = useMemo(() => buildRows(jobs), [jobs]);
  const jobCount = jobs.length;

  const visible = useMemo(() => {
    if (jobCount <= limit) return allRows;
    let jobsShown = 0;
    const out: Row[] = [];
    for (const row of allRows) {
      if (row.kind === "job") {
        if (jobsShown >= limit) break;
        jobsShown += 1;
      }
      out.push(row);
    }
    // Drop trailing month/day headers with no jobs under them
    while (out.length && out[out.length - 1].kind !== "job") out.pop();
    return out;
  }, [allRows, jobCount, limit]);

  if (!jobCount) {
    return <div className="p-4 text-center text-sm text-muted">No other jobs assigned.</div>;
  }

  return (
    <>
      {visible.map((row) => {
        if (row.kind === "month") {
          return (
            <div key={row.key} className="border-b border-line bg-canvas px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              {row.label}
            </div>
          );
        }
        if (row.kind === "day") {
          return (
            <div key={row.key} className="sticky top-14 z-10 border-b border-line bg-white/95 px-4 py-1.5 text-[12.5px] font-semibold text-ink backdrop-blur md:top-[60px]">
              {row.label}
            </div>
          );
        }
        const j = row.job;
        return (
          <Link key={row.key} href={`/jobs/${j.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-[#fafbf9]">
            <div className="w-16 shrink-0 text-[12px] text-muted">{fmtRange(j.starts_at, j.ends_at)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{j.title}</div>
              <div className="truncate text-[12.5px] text-muted">{j.customer_name}</div>
            </div>
            <Icon name="right" className="size-4 text-muted" />
          </Link>
        );
      })}
      {jobCount > limit && (
        <div className="border-t border-line p-3 text-center">
          <button type="button" className="btn btn-sm" onClick={() => setLimit((n) => n + PAGE)}>
            Show more ({jobCount - limit} remaining)
          </button>
        </div>
      )}
    </>
  );
}
