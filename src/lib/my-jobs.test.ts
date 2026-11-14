import { describe, expect, it } from "vitest";
import { addDays, dayKey, fmtDay, fmtRange, zonedToUtc } from "@/lib/time";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/types";
import {
  daysBetween,
  isOverdueNotStarted,
  listMyJobsVisits,
  liveVisitsForProject,
  myJobsBucket,
  overdueCaption,
  partitionMyJobs,
  type MyJobsBucket,
} from "@/lib/my-jobs";

const TODAY = "2026-11-12";
const STATUSES = Object.keys(JOB_STATUS_LABEL) as JobStatus[];
const WHEN = ["past", "today", "future"] as const;

function at(dayOffset: number, hour = 8) {
  return zonedToUtc(addDays(TODAY, dayOffset), hour * 60);
}

function job(status: JobStatus, when: (typeof WHEN)[number], extra: { id?: string; title?: string; project_id?: string; review_note?: string | null } = {}) {
  const dayOffset = when === "past" ? -2 : when === "today" ? 0 : 18;
  return {
    id: extra.id ?? `${status}-${when}`,
    title: extra.title ?? `${status} ${when}`,
    project_id: extra.project_id ?? "p1",
    starts_at: at(dayOffset, 8),
    status,
    review_note: extra.review_note ?? null,
  };
}

describe("myJobsBucket", () => {
  it("puts every assigned non-cancelled visit in exactly one bucket (status × past/today/future)", () => {
    const seen: { status: JobStatus; when: string; bucket: MyJobsBucket | null }[] = [];
    for (const status of STATUSES) {
      for (const when of WHEN) {
        const bucket = myJobsBucket(job(status, when), TODAY);
        seen.push({ status, when, bucket });
        if (status === "cancelled") expect(bucket, `${status} ${when}`).toBeNull();
        else expect(bucket, `${status} ${when}`).toBeTruthy();
      }
    }
    expect(seen).toHaveLength(STATUSES.length * WHEN.length);

    // Expected partition
    for (const when of WHEN) {
      expect(myJobsBucket(job("in_progress", when), TODAY)).toBe("today");
      expect(myJobsBucket(job("completed", when), TODAY)).toBe("submitted");
      expect(myJobsBucket(job("approved", when), TODAY)).toBe("submitted");
      expect(myJobsBucket(job("cancelled", when), TODAY)).toBeNull();
    }
    expect(myJobsBucket(job("scheduled", "past"), TODAY)).toBe("overdue");
    expect(myJobsBucket(job("scheduled", "today"), TODAY)).toBe("today");
    expect(myJobsBucket(job("scheduled", "future"), TODAY)).toBe("upcoming");
  });

  it("never places the same visit in two buckets", () => {
    const jobs = STATUSES.flatMap((status) => WHEN.map((when) => job(status, when)));
    const { overdue, today, upcoming, submitted } = partitionMyJobs(jobs, TODAY);
    const ids = [...overdue, ...today, ...upcoming, ...submitted].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(jobs.filter((j) => j.status !== "cancelled").length);
    expect(overdue.map((j) => j.id)).toEqual(["scheduled-past"]);
    expect(today.map((j) => j.status).every((s) => s !== "scheduled" || dayKey(today.find((j) => j.status === "scheduled")!.starts_at) === TODAY)).toBe(true);
  });
});

describe("overdue classification (America/Chicago, including midnight)", () => {
  it("treats a scheduled visit whose calendar day is before today as overdue and not started", () => {
    const past = job("scheduled", "past");
    expect(isOverdueNotStarted(past, TODAY)).toBe(true);
    expect(dayKey(past.starts_at)).toBe("2026-11-10");
    expect(daysBetween("2026-11-10", TODAY)).toBe(2);
    expect(overdueCaption(past.starts_at, TODAY)).toBe("Was scheduled Tue, Nov 10 · 2 days overdue");
  });

  it("is not overdue when the visit is still scheduled for today, even late in the evening", () => {
    const late = { starts_at: zonedToUtc(TODAY, 23 * 60), status: "scheduled" as const };
    expect(dayKey(late.starts_at)).toBe(TODAY);
    expect(isOverdueNotStarted(late, TODAY)).toBe(false);
    expect(myJobsBucket(late, TODAY)).toBe("today");
  });

  it("flips to overdue at Central midnight, not UTC midnight", () => {
    // Thu Nov 12 11:00pm CT = Fri Nov 13 05:00 UTC. Still "today" on Nov 12; overdue on Nov 13.
    const elevenPm = zonedToUtc("2026-11-12", 23 * 60);
    expect(elevenPm).toBe("2026-11-13T05:00:00.000Z");
    expect(dayKey(elevenPm)).toBe("2026-11-12");
    expect(myJobsBucket({ starts_at: elevenPm, status: "scheduled" }, "2026-11-12")).toBe("today");
    expect(isOverdueNotStarted({ starts_at: elevenPm, status: "scheduled" }, "2026-11-12")).toBe(false);
    expect(myJobsBucket({ starts_at: elevenPm, status: "scheduled" }, "2026-11-13")).toBe("overdue");
    expect(isOverdueNotStarted({ starts_at: elevenPm, status: "scheduled" }, "2026-11-13")).toBe(true);
    expect(overdueCaption(elevenPm, "2026-11-13")).toBe("Was scheduled Thu, Nov 12 · 1 day overdue");

    // UTC midnight Nov 13 = Nov 12 6:00pm CT — still Nov 12 locally, overdue once today is Nov 13.
    const utcMidnight = "2026-11-13T00:00:00.000Z";
    expect(dayKey(utcMidnight)).toBe("2026-11-12");
    expect(myJobsBucket({ starts_at: utcMidnight, status: "scheduled" }, "2026-11-12")).toBe("today");
    expect(myJobsBucket({ starts_at: utcMidnight, status: "scheduled" }, "2026-11-13")).toBe("overdue");

    // Fri Nov 13 12:00am CT is today on Nov 13, upcoming on Nov 12, overdue on Nov 14.
    const localMidnight = zonedToUtc("2026-11-13", 0);
    expect(localMidnight).toBe("2026-11-13T06:00:00.000Z");
    expect(dayKey(localMidnight)).toBe("2026-11-13");
    expect(myJobsBucket({ starts_at: localMidnight, status: "scheduled" }, "2026-11-12")).toBe("upcoming");
    expect(myJobsBucket({ starts_at: localMidnight, status: "scheduled" }, "2026-11-13")).toBe("today");
    expect(myJobsBucket({ starts_at: localMidnight, status: "scheduled" }, "2026-11-14")).toBe("overdue");

    // Just after midnight Central.
    const halfPast = zonedToUtc("2026-11-13", 30);
    expect(dayKey(halfPast)).toBe("2026-11-13");
    expect(isOverdueNotStarted({ starts_at: halfPast, status: "scheduled" }, "2026-11-13")).toBe(false);
    expect(isOverdueNotStarted({ starts_at: elevenPm, status: "scheduled" }, "2026-11-13")).toBe(true);
  });

  it("does not mark in-progress or submitted visits as overdue, even when the scheduled day has passed", () => {
    expect(isOverdueNotStarted(job("in_progress", "past"), TODAY)).toBe(false);
    expect(myJobsBucket(job("in_progress", "past"), TODAY)).toBe("today");
    expect(isOverdueNotStarted(job("completed", "past"), TODAY)).toBe(false);
    expect(isOverdueNotStarted(job("approved", "past"), TODAY)).toBe(false);
    expect(isOverdueNotStarted(job("cancelled", "past"), TODAY)).toBe(false);
  });

  it("counts calendar days across a spring-forward DST weekend in Chicago", () => {
    // 2026-03-08 is DST start; 2026-03-07 to 2026-03-09 is still 2 calendar days.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
  });

  it("formats the scheduled date and time window in Central time", () => {
    const starts = zonedToUtc("2026-11-12", 8 * 60);
    const ends = zonedToUtc("2026-11-12", 12 * 60);
    expect(`${fmtDay(dayKey(starts))} · ${fmtRange(starts, ends)}`).toBe("Thu, Nov 12 · 8am–12pm");
  });
});

describe("partitionMyJobs overdue vs today counts", () => {
  it("keeps overdue visits out of Today and sorts oldest first", () => {
    const older = job("scheduled", "past", { id: "older" });
    const newerPast = { ...job("scheduled", "past", { id: "newer" }), starts_at: at(-1, 11) };
    const todayVisit = job("scheduled", "today", { id: "today-visit" });
    const startedEarly = job("in_progress", "future", { id: "started-early" });
    const { overdue, today, upcoming, submitted } = partitionMyJobs([newerPast, older, todayVisit, startedEarly], TODAY);
    expect(overdue.map((j) => j.id)).toEqual(["older", "newer"]);
    expect(today.map((j) => j.id)).toEqual(["started-early", "today-visit"]);
    expect(upcoming).toHaveLength(0);
    expect(submitted).toHaveLength(0);
  });
});

describe("listMyJobsVisits", () => {
  it("loads all scheduled/in_progress visits without a 7-day floor, and only recent submitted ones", async () => {
    const calls: unknown[] = [];
    const repo = {
      async listJobs(f: unknown) {
        calls.push(f);
        return [];
      },
    };
    await listMyJobsVisits(repo, "u-tech", TODAY);
    expect(calls).toEqual([
      { assignee: "u-tech", status: ["scheduled", "in_progress"] },
      { from: zonedToUtc(addDays(TODAY, -7), 0), assignee: "u-tech", status: ["completed", "approved"] },
    ]);
  });
});

describe("367 Glen Leven case", () => {
  // Mirrors prod: visit scheduled Mon Nov 30 8am CT, started early on Nov 12, assigned to a tech.
  const glen = job("in_progress", "future", {
    id: "j-glen",
    title: "367 Glen Leven ct LED",
    project_id: "p-glen",
  });
  // Confirm the fixture really is Nov 30 8am Chicago relative to the frozen "today".
  it("is an in_progress visit dated in the future (Mon, Nov 30 8am CT)", () => {
    expect(dayKey(glen.starts_at)).toBe("2026-11-30");
    expect(glen.starts_at).toBe("2026-11-30T14:00:00.000Z");
    expect(myJobsBucket(glen, TODAY)).toBe("today");
    expect(isOverdueNotStarted(glen, TODAY)).toBe(false);
  });

  it("appears under Today on tech Home, not Coming up, Overdue, or Recently submitted", () => {
    const alsoScheduledToday = job("scheduled", "today", { id: "j-today", title: "Other visit today" });
    const pastScheduled = job("scheduled", "past", { id: "j-overdue" });
    const { overdue, today, upcoming, submitted } = partitionMyJobs([glen, alsoScheduledToday, pastScheduled], TODAY);
    expect(today.map((j) => j.id)).toEqual(["j-glen", "j-today"]); // in_progress first
    expect(overdue.map((j) => j.id)).toEqual(["j-overdue"]);
    expect(upcoming.map((j) => j.id)).not.toContain("j-glen");
    expect(submitted.map((j) => j.id)).not.toContain("j-glen");
  });

  it("is counted on the customer Projects tab", () => {
    const cancelled = job("cancelled", "future", { id: "j-cancelled", project_id: "p-glen" });
    const otherProject = job("scheduled", "today", { id: "j-other", project_id: "p-other" });
    const visits = [glen, cancelled, otherProject];
    const listed = liveVisitsForProject(visits, "p-glen");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe("j-glen");
  });
});
