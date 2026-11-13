import { describe, expect, it } from "vitest";
import {
  SCHEDULE_UNASSIGNED_ID,
  pinUnassignedLast,
  scheduleBoardRows,
  sortScheduleCrewVehicles,
  sortSchedulePeople,
  sortScheduleVisits,
} from "./schedule-sort";

const person = (full_name: string, id = full_name) => ({ id, full_name, role: "tech" });

describe("sortSchedulePeople", () => {
  it("sorts lanes A–Z by display name, case-insensitively", () => {
    const rows = [person("jake Sullivan", "j"), person("Andre Williams", "a"), person("emily chen", "e"), person("Carlos Mendez", "c")];
    expect(sortSchedulePeople(rows).map((p) => p.full_name)).toEqual([
      "Andre Williams",
      "Carlos Mendez",
      "emily chen",
      "jake Sullivan",
    ]);
  });

  it("does not group by role", () => {
    const rows = [
      { id: "u-luke", full_name: "Luke Dlugosz", role: "admin" },
      { id: "u-andre", full_name: "Andre Williams", role: "tech" },
      { id: "u-maria", full_name: "Maria Santos", role: "manager" },
    ];
    expect(sortSchedulePeople(rows).map((p) => p.full_name)).toEqual([
      "Andre Williams",
      "Luke Dlugosz",
      "Maria Santos",
    ]);
  });
});

describe("scheduleBoardRows", () => {
  it("pins Unassigned last even though U sits in the middle of the alphabet", () => {
    const rows = [person("Zed York"), person("Amy Cole")];
    const unassigned = { id: SCHEDULE_UNASSIGNED_ID, full_name: "Unassigned", role: "" };
    expect(scheduleBoardRows(rows, { includeUnassigned: true, unassigned }).map((p) => p.full_name)).toEqual([
      "Amy Cole",
      "Zed York",
      "Unassigned",
    ]);
  });

  it("omits Unassigned when it is not needed", () => {
    const rows = [person("Zed York"), person("Amy Cole")];
    const unassigned = { id: SCHEDULE_UNASSIGNED_ID, full_name: "Unassigned", role: "" };
    expect(scheduleBoardRows(rows, { includeUnassigned: false, unassigned }).map((p) => p.full_name)).toEqual([
      "Amy Cole",
      "Zed York",
    ]);
  });

  it("pinUnassignedLast keeps a missing Unassigned lane off the board", () => {
    expect(pinUnassignedLast([person("Zed York")], null).map((p) => p.full_name)).toEqual(["Zed York"]);
  });
});

describe("sortScheduleVisits", () => {
  it("keeps visits in start-time order within a person", () => {
    const jobs = [
      { id: "later", starts_at: "2026-11-13T16:00:00-06:00" },
      { id: "earlier", starts_at: "2026-11-13T08:00:00-06:00" },
      { id: "mid-b", starts_at: "2026-11-13T10:00:00-06:00" },
      { id: "mid-a", starts_at: "2026-11-13T10:00:00-06:00" },
    ];
    expect(sortScheduleVisits(jobs).map((j) => j.id)).toEqual(["earlier", "mid-a", "mid-b", "later"]);
  });
});

describe("sortScheduleCrewVehicles", () => {
  it("sorts the day-view map list A–Z by assignee name and keeps unmapped trucks last", () => {
    const vehicles = [
      { id: "truck-1", profile: { full_name: "Carlos Mendez" } },
      { id: "van-3", profile: { full_name: "jake sullivan" } },
      { id: "spare", profile: null },
      { id: "truck-4", profile: { full_name: "Andre Williams" } },
    ];
    expect(sortScheduleCrewVehicles(vehicles).map((v) => v.id)).toEqual([
      "truck-4",
      "truck-1",
      "van-3",
      "spare",
    ]);
  });
});
