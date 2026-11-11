import { describe, expect, it } from "vitest";
import { applyTicketVisits, pickTicketVisit, resolveNewTicketAssignee } from "./tickets";

const luke = { id: "u-luke", name: "Luke" };
const staff = [
  { id: "u-luke", full_name: "Luke" },
  { id: "u-manager", full_name: "Alex Manager" },
];

describe("resolveNewTicketAssignee", () => {
  it("defaults to the person who logged the ticket", () => {
    expect(resolveNewTicketAssignee(undefined, luke, staff)).toEqual({ id: "u-luke", name: "Luke" });
    expect(resolveNewTicketAssignee("", luke, staff)).toEqual({ id: "u-luke", name: "Luke" });
    expect(resolveNewTicketAssignee("   ", luke, staff)).toEqual({ id: "u-luke", name: "Luke" });
    expect(resolveNewTicketAssignee(null, luke)).toEqual({ id: "u-luke", name: "Luke" });
  });

  it("uses an explicitly chosen staff assignee", () => {
    expect(resolveNewTicketAssignee("u-manager", luke, staff)).toEqual({ id: "u-manager", name: "Alex Manager" });
  });

  it("rejects an unknown or non-staff assignee", () => {
    expect(resolveNewTicketAssignee("u-tech", luke, staff)).toEqual({ error: "Pick an admin or manager." });
    expect(resolveNewTicketAssignee("u-manager", luke, [])).toEqual({ error: "Pick an admin or manager." });
  });
});

import type { JobKind, JobStatus, Person, TicketVisitCrew } from "./types";

const tech = (id: string, name: string): Person => ({ id, full_name: name, color: "#000" });
const visit = (
  request_id: string,
  job_id: string,
  starts_at: string,
  status: JobStatus,
  techs: Person[] = [],
  kind: JobKind = "warranty",
): TicketVisitCrew & { request_id: string } => ({ request_id, job_id, starts_at, status, kind, techs });

describe("pickTicketVisit", () => {
  it("returns null when there are no visits, or only cancelled ones", () => {
    expect(pickTicketVisit([])).toBeNull();
    expect(pickTicketVisit([visit("t", "j1", "2026-11-12T15:00:00Z", "cancelled")])).toBeNull();
  });
  it("picks the soonest scheduled or in-progress visit as the upcoming one", () => {
    const later = visit("t", "j-later", "2026-11-20T15:00:00Z", "scheduled", [tech("a", "Ann")]);
    const sooner = visit("t", "j-soon", "2026-11-12T15:00:00Z", "scheduled", [tech("b", "Bob")]);
    const past = visit("t", "j-past", "2026-10-01T15:00:00Z", "approved", [tech("c", "Cara")]);
    expect(pickTicketVisit([later, past, sooner])?.job_id).toBe("j-soon");
    const active = visit("t", "j-now", "2026-11-11T14:00:00Z", "in_progress", [tech("b", "Bob")]);
    expect(pickTicketVisit([later, active])?.job_id).toBe("j-now");
  });
  it("falls back to the latest completed visit when none are upcoming", () => {
    const older = visit("t", "j-old", "2026-09-01T15:00:00Z", "approved");
    const newer = visit("t", "j-new", "2026-10-15T15:00:00Z", "completed");
    expect(pickTicketVisit([older, newer])?.job_id).toBe("j-new");
  });
});

describe("applyTicketVisits", () => {
  it("attaches the chosen visit per ticket and leaves others with no visit", () => {
    const [a, b] = applyTicketVisits(
      [{ id: "sr-a" }, { id: "sr-b" }],
      [visit("sr-a", "j1", "2026-11-12T15:00:00Z", "scheduled", [tech("u-tech1", "Carlos Mendez")])],
    );
    expect(a.visit?.job_id).toBe("j1");
    expect(a.visit?.techs.map((p) => p.full_name)).toEqual(["Carlos Mendez"]);
    expect(b.visit).toBeNull();
  });
});
