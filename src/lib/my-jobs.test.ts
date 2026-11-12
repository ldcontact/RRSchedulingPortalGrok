import { describe, expect, it } from "vitest";
import { addDays, dayKey, zonedToUtc } from "@/lib/time";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/types";
import { liveVisitsForProject, myJobsBucket, partitionMyJobs, type MyJobsBucket } from "@/lib/my-jobs";

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
    expect(myJobsBucket(job("scheduled", "past"), TODAY)).toBe("today");
    expect(myJobsBucket(job("scheduled", "today"), TODAY)).toBe("today");
    expect(myJobsBucket(job("scheduled", "future"), TODAY)).toBe("upcoming");
  });

  it("never places the same visit in two buckets", () => {
    const jobs = STATUSES.flatMap((status) => WHEN.map((when) => job(status, when)));
    const { today, upcoming, submitted } = partitionMyJobs(jobs, TODAY);
    const ids = [...today, ...upcoming, ...submitted].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(jobs.filter((j) => j.status !== "cancelled").length);
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
  });

  it("appears under Today on tech Home, not Coming up or Recently submitted", () => {
    const alsoScheduledToday = job("scheduled", "today", { id: "j-today", title: "Other visit today" });
    const { today, upcoming, submitted } = partitionMyJobs([glen, alsoScheduledToday], TODAY);
    expect(today.map((j) => j.id)).toEqual(["j-glen", "j-today"]); // in_progress first
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
