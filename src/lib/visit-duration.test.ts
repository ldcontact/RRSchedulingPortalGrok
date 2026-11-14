import { describe, expect, it } from "vitest";
import { addDays, fmtTime, zonedToUtc } from "@/lib/time";
import {
  completedCaption,
  durationMs,
  formatDuration,
  inProgressCaption,
  overWindowLabel,
  overWindowMinutes,
  visitDurationCaption,
} from "@/lib/visit-duration";

describe("formatDuration", () => {
  it("formats minutes, hours, and mixed spans the way the tiles show them", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(35 * 60_000)).toBe("35m");
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration((1 * 60 + 20) * 60_000)).toBe("1h 20m");
    expect(formatDuration((2 * 60 + 35) * 60_000)).toBe("2h 35m");
  });

  it("does not go negative when the clock is slightly behind the start", () => {
    expect(formatDuration(-5_000)).toBe("0m");
    expect(durationMs("2026-11-14T14:12:00.000Z", "2026-11-14T14:11:30.000Z")).toBe(0);
  });
});

describe("captions in America/Chicago", () => {
  // Sat Nov 14 2026 is CST (UTC-6).
  const started = zonedToUtc("2026-11-14", 8 * 60 + 12); // 8:12am CT
  const finished = zonedToUtc("2026-11-14", 10 * 60 + 47); // 10:47am CT
  const later = zonedToUtc("2026-11-14", 9 * 60 + 32);

  it("formats start and finish clocks in Central time", () => {
    expect(started).toBe("2026-11-14T14:12:00.000Z");
    expect(fmtTime(started)).toBe("8:12am");
    expect(fmtTime(finished)).toBe("10:47am");
    expect(inProgressCaption(started, later)).toBe("Started 8:12am · 1h 20m so far");
    expect(completedCaption(started, finished)).toBe("Started 8:12am · Finished 10:47am · took 2h 35m");
  });

  it("counts across Central midnight, not UTC midnight", () => {
    // Fri Nov 13 11:50pm CT = Sat Nov 14 05:50 UTC. 30 minutes later is Sat 12:20am CT.
    const late = zonedToUtc("2026-11-13", 23 * 60 + 50);
    const afterMidnight = zonedToUtc("2026-11-14", 20);
    expect(late).toBe("2026-11-14T05:50:00.000Z");
    expect(afterMidnight).toBe("2026-11-14T06:20:00.000Z");
    expect(fmtTime(late)).toBe("11:50pm");
    expect(fmtTime(afterMidnight)).toBe("12:20am");
    expect(inProgressCaption(late, afterMidnight)).toBe("Started 11:50pm · 30m so far");
  });

  it("picks the in-progress vs completed caption from status", () => {
    expect(visitDurationCaption({ status: "scheduled", started_at: started }, later)).toBeNull();
    expect(visitDurationCaption({ status: "in_progress", started_at: started }, later)).toBe("Started 8:12am · 1h 20m so far");
    expect(visitDurationCaption({ status: "completed", started_at: started, completed_at: finished })).toBe(
      "Started 8:12am · Finished 10:47am · took 2h 35m",
    );
    expect(visitDurationCaption({ status: "approved", started_at: started, completed_at: finished })).toBe(
      "Started 8:12am · Finished 10:47am · took 2h 35m",
    );
    expect(visitDurationCaption({ status: "in_progress" }, later)).toBeNull();
    expect(visitDurationCaption({ status: "cancelled", started_at: started, completed_at: finished })).toBeNull();
  });
});

describe("over-window logic", () => {
  const day = "2026-11-12";
  const ends = zonedToUtc(day, 12 * 60); // 12pm CT
  const exact = ends;
  const oneSecond = new Date(new Date(ends).getTime() + 1000).toISOString();
  const thirtyFive = zonedToUtc(day, 12 * 60 + 35);
  const oneHourFive = zonedToUtc(day, 13 * 60 + 5);
  const early = zonedToUtc(day, 11 * 60 + 50);

  it("is not over the window when the finish is on or before the scheduled end", () => {
    expect(overWindowMinutes(exact, ends)).toBe(0);
    expect(overWindowMinutes(early, ends)).toBe(0);
    expect(overWindowLabel(exact, ends)).toBeNull();
  });

  it("flags a finish after the scheduled end, including a 35m overrun", () => {
    expect(overWindowMinutes(oneSecond, ends)).toBe(1);
    expect(overWindowLabel(oneSecond, ends)).toBe("1m over window");
    expect(overWindowMinutes(thirtyFive, ends)).toBe(35);
    expect(overWindowLabel(thirtyFive, ends)).toBe("35m over window");
    expect(overWindowMinutes(oneHourFive, ends)).toBe(65);
    expect(overWindowLabel(oneHourFive, ends)).toBe("1h 5m over window");
  });

  it("uses the Central calendar, not UTC, when the window ends near midnight", () => {
    // Window ends Fri Nov 13 11:00pm CT = Sat 05:00 UTC. Finish Sat 12:20am CT is 1h 20m over.
    const windowEnd = zonedToUtc("2026-11-13", 23 * 60);
    const finish = zonedToUtc(addDays("2026-11-13", 1), 20);
    expect(windowEnd).toBe("2026-11-14T05:00:00.000Z");
    expect(overWindowMinutes(finish, windowEnd)).toBe(80);
    expect(overWindowLabel(finish, windowEnd)).toBe("1h 20m over window");
  });
});
