"use client";

import { useMemo, useState } from "react";
import { dayKey, fmtDay } from "@/lib/time";
import type { JobView } from "@/lib/types";
import { TechJobCard } from "./tech-job-card";

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
    while (out.length && out[out.length - 1].kind !== "job") out.pop();
    return out;
  }, [allRows, jobCount, limit]);

  if (!jobCount) {
    return <div className="card p-6 text-center text-sm text-muted">No other jobs assigned.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((row) => {
        if (row.kind === "month") {
          return (
            <div key={row.key} className="pt-1 text-[11px] font-bold uppercase tracking-wide text-muted">
              {row.label}
            </div>
          );
        }
        if (row.kind === "day") {
          return (
            <div key={row.key} className="-mb-1 text-[13px] font-semibold text-ink">
              {row.label}
            </div>
          );
        }
        return <TechJobCard key={row.key} j={row.job} />;
      })}
      {jobCount > limit && (
        <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({jobCount - limit} remaining)
        </button>
      )}
    </div>
  );
}
