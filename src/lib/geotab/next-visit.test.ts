import { describe, expect, it } from "vitest";
import { ARRIVAL_RADIUS_M } from "./distance";
import { buildNearestVisit, formatEtaSummary, pickNextVisitToday, visitPinColor } from "./next-visit";
import type { FleetVisitPin } from "./types";

const asOf = "2026-11-13T15:24:00.000Z"; // 9:24 AM CT

function pin(partial: Partial<FleetVisitPin> & Pick<FleetVisitPin, "jobId" | "startsAt" | "endsAt" | "assigneeIds">): FleetVisitPin {
  return {
    title: "Visit",
    customerName: "Customer",
    address: "1 Main St",
    latitude: 42.05,
    longitude: -88.1,
    projectId: null,
    projectName: null,
    projectType: "lighting",
    kind: "install",
    status: "scheduled",
    assignees: [],
    ...partial,
  };
}

describe("pickNextVisitToday", () => {
  const morning = pin({ jobId: "am", customerName: "Morning", startsAt: "2026-11-13T14:00:00.000Z", endsAt: "2026-11-13T16:00:00.000Z", assigneeIds: ["u-tech1"], latitude: 42.06, longitude: -88.11 });
  const later = pin({ jobId: "pm", customerName: "Later", startsAt: "2026-11-13T17:00:00.000Z", endsAt: "2026-11-13T20:00:00.000Z", assigneeIds: ["u-tech1"], latitude: 42.00, longitude: -88.00 });
  const done = pin({ jobId: "done", customerName: "Done", startsAt: "2026-11-13T13:00:00.000Z", endsAt: "2026-11-13T14:30:00.000Z", assigneeIds: ["u-tech1"] });
  const other = pin({ jobId: "other", customerName: "Other tech", startsAt: "2026-11-13T15:00:00.000Z", endsAt: "2026-11-13T18:00:00.000Z", assigneeIds: ["u-tech2"] });

  it("returns null when the tech has no remaining visit today", () => {
    expect(pickNextVisitToday([done, other], "u-tech1", { status: "driving", lat: 42.05, lng: -88.1 }, asOf)).toBeNull();
  });

  it("prefers a visit the stopped truck is already on site for", () => {
    const here = pickNextVisitToday(
      [morning, later],
      "u-tech1",
      { status: "stopped", lat: later.latitude, lng: later.longitude },
      asOf,
    );
    expect(here?.jobId).toBe("pm");
  });

  it("picks the closest in-progress visit, else the soonest upcoming one", () => {
    const current = pickNextVisitToday([morning, later], "u-tech1", { status: "driving", lat: 42.05, lng: -88.1 }, asOf);
    expect(current?.jobId).toBe("am");
    const afterMorning = pickNextVisitToday([morning, later], "u-tech1", { status: "driving", lat: 42.05, lng: -88.1 }, "2026-11-13T16:30:00.000Z");
    expect(afterMorning?.jobId).toBe("pm");
  });

  it("ignores a visit that started on a previous day even if it has not ended yet", () => {
    const stale = pin({
      jobId: "stale",
      customerName: "Mike Hennessy",
      startsAt: "2026-11-04T12:00:00.000Z",
      endsAt: "2026-11-20T22:00:00.000Z",
      assigneeIds: ["u-tech1"],
    });
    expect(pickNextVisitToday([stale], "u-tech1", { status: "stopped", lat: 42.05, lng: -88.1 }, asOf)).toBeNull();
    expect(pickNextVisitToday([stale, later], "u-tech1", { status: "driving", lat: 42.05, lng: -88.1 }, asOf)?.jobId).toBe("pm");
  });
});

describe("ETA and on-site copy", () => {
  it("marks a late arrival in red copy and an early or on-time arrival as not late", () => {
    expect(formatEtaSummary("2026-11-13T15:40:00.000Z", "2026-11-13T15:30:00.000Z")).toEqual({
      summary: "Arrives ~9:40 AM, 10 min late",
      late: true,
    });
    expect(formatEtaSummary("2026-11-13T15:40:00.000Z", "2026-11-13T15:30:00.000Z", "2026-11-13T15:35:00.000Z")).toEqual({
      summary: "Arrives ~9:40 AM, 10 min late",
      late: true,
    });
    expect(formatEtaSummary("2026-11-13T15:25:00.000Z", "2026-11-13T15:30:00.000Z")).toMatchObject({ late: false, summary: "Arrives ~9:25 AM, 5 min early" });
    expect(formatEtaSummary("2026-11-13T15:30:00.000Z", "2026-11-13T15:30:00.000Z")).toMatchObject({ late: false, summary: "Arrives ~9:30 AM, on time" });
  });

  it("does not mark late when the visit started on a previous day", () => {
    expect(formatEtaSummary("2026-11-13T22:27:00.000Z", "2026-11-04T12:00:00.000Z", "2026-11-13T22:03:00.000Z")).toEqual({
      summary: "Arrives ~4:27 PM",
      late: false,
    });
  });

  it("does not mark late when today's scheduled start has not passed yet", () => {
    expect(formatEtaSummary("2026-11-13T18:20:00.000Z", "2026-11-13T18:00:00.000Z", asOf)).toEqual({
      summary: "Arrives ~12:20 PM",
      late: false,
    });
  });

  it("uses On site since when a stopped truck is within 150 m", () => {
    const visit = pin({ jobId: "am", customerName: "Golf Road Auto Body", startsAt: "2026-11-13T13:00:00.000Z", endsAt: "2026-11-13T21:00:00.000Z", assigneeIds: ["u-tech4"], address: "905 E Golf Rd" });
    const built = buildNearestVisit({
      visit,
      vehicle: { status: "stopped", lat: visit.latitude, lng: visit.longitude + 0.0005, lastUpdate: "2026-11-13T15:24:00.000Z", currentStateDuration: "00:36:00" },
      asOf,
      speedMph: 0,
    });
    expect(built.kind).toBe("onsite");
    expect(built.onSiteSinceLabel).toBe("On site since 8:48 AM");
    expect(ARRIVAL_RADIUS_M).toBe(150);
  });

  it("colors a visit pin with the first assignee's calendar color", () => {
    expect(visitPinColor({ assignees: [{ color: "#16a34a" }, { color: "#ea580c" }] })).toBe("#16a34a");
    expect(visitPinColor({ assignees: [] })).toBe("#d97706");
  });
});
