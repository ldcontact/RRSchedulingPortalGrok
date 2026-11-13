import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { Banner } from "@/components/ui";
import { isStaff, requireMember } from "@/lib/auth";
import { fleetScope } from "@/lib/geotab/access";
import { findConflicts, getRepo } from "@/lib/data/repo";
import { addDays, monthStart, todayKey, validDay, weekStart, zonedToUtc } from "@/lib/time";
import { sortSchedulePeople } from "@/lib/schedule-sort";
import { ScheduleBoard, type View } from "./schedule-board";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const user = await requireMember();
  const sp = await searchParams;
  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const date = validDay(sp.date) ? sp.date : todayKey();
  const tech = typeof sp.tech === "string" ? sp.tech : "";
  const start = view === "day" ? date : view === "week" ? weekStart(date) : weekStart(monthStart(date));
  const days = view === "day" ? 1 : view === "week" ? 7 : 42;
  const repo = await getRepo();
  const [all, people] = await Promise.all([
    repo.listJobs({ from: zonedToUtc(start, 0), to: zonedToUtc(addDays(start, days), 0) }), // techs: RLS returns only their own
    repo.listAssignable(),
  ]);
  const jobs = all.filter((j) => j.status !== "cancelled" && (!tech || j.assignees.some((a) => a.id === tech)));
  const conflicted = new Set<string>();
  for (const j of jobs) if (findConflicts(all, j.assignees.map((a) => a.id), j.starts_at, j.ends_at, j.id).length) conflicted.add(j.id);
  const staff = isStaff(user.role);
  const rows = sortSchedulePeople(
    (staff ? people.filter((p) => p.role === "tech" || jobs.some((j) => j.assignees.some((a) => a.id === p.id))) : people.filter((p) => p.id === user.id))
      .filter((p) => !tech || p.id === tech),
  );
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  return (
    <>
      {ok && <div className="mb-3"><Banner tone="ok"><Icon name="check" />{ok}</Banner></div>}
      <ScheduleBoard view={view} date={date} start={start} days={days} tech={tech} today={todayKey()} staff={staff}
        people={staff ? sortSchedulePeople(people) : []} rows={rows} jobs={jobs} conflicted={[...conflicted]} fleet={fleetScope(user) === "all"} />
    </>
  );
}
