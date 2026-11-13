import { describe, expect, it } from "vitest";
import { zonedToUtc } from "@/lib/time";
import { PROJECT_TYPE_LABEL } from "@/lib/types";
import {
  COMPANY_NAME,
  COMPANY_PHONE,
  TEAM_SIGNOFF,
  buildScheduleEmailDraft,
  cleanVisitTitle,
  customerFacingNotes,
  formatScheduleEmailEventBody,
  formatVisitDate,
  formatVisitDuration,
  invalidEmails,
  lastScheduleEmailEvent,
  parseEmailList,
  pickScheduleVisit,
  scheduleEmailBlockers,
  scheduleEmailBody,
  scheduleEmailHtml,
  scheduleEmailSubject,
  escapeHtml,
} from "@/lib/service-request-email";

const starts = zonedToUtc("2026-11-14", 9 * 60);
const ends = zonedToUtc("2026-11-14", 11 * 60);

/** SR-1004 mock: Elk Grove Precision, warranty visit for exit fixture batteries. */
const sr1004DraftOpts = {
  customerEmail: "dkowalski@egprecision.example",
  creatorEmail: "maria.santos@gmail.com",
  customerName: "Elk Grove Precision Machining",
  contactName: "Dave Kowalski",
  visit: {
    starts_at: starts,
    ends_at: ends,
    title: "Warranty — exit fixture batteries",
    instructions: "Swap the battery packs in the 2 emergency fixtures at the rear exits (same model as the original install). Photo each fixture after a 90-minute test.",
    kind: "warranty" as const,
    assignees: [{ full_name: "Carlos Mendez" }],
  },
  address: "2250 Lunt Ave, Elk Grove Village, IL 60007",
  ticketNumber: "SR-1004",
  ticketDescription: "Fire inspection flagged the two emergency fixtures by the rear exits: battery test fails after about 30 seconds.",
  warrantyMonths: 12,
  projectName: "Office & breakroom LED troffer retrofit",
  projectTypeLabel: PROJECT_TYPE_LABEL.lighting,
};

const SR1004_DEFAULT_BODY = `Hi Dave,

We're writing to confirm your upcoming service visit with Retrofit Rebates, Inc.

We'll be on site for a warranty visit: Exit fixture batteries.

Fire inspection flagged the two emergency fixtures by the rear exits: battery test fails after about 30 seconds.

We'll swap the battery packs in the 2 emergency fixtures at the rear exits (same model as the original install).

This work is on your LED Lighting project, Office & breakroom LED troffer retrofit, and is covered under your 12-month warranty.

Date and arrival window:
Saturday, November 14, 2026, 9am–11am (Central Time)

Assigned technician:
Carlos Mendez

Service address:
2250 Lunt Ave, Elk Grove Village, IL 60007

What to expect:
Please have someone on site who can give our technician access to the work area. The visit is scheduled for about 2 hours, based on the arrival window.

If you need to reschedule or have any questions, just reply to this email or call us at 773-362-5003.

Thank you,
The Retrofit Rebates Team`;

describe("parseEmailList / invalidEmails", () => {
  it("splits, lowercases, and de-dupes", () => {
    expect(parseEmailList("Ada@X.com, bob@x.com; ADA@x.com  cara@z.com")).toEqual([
      "ada@x.com",
      "bob@x.com",
      "cara@z.com",
    ]);
    expect(parseEmailList(["  One@x.com ", "two@x.com"])).toEqual(["one@x.com", "two@x.com"]);
    expect(parseEmailList("")).toEqual([]);
  });

  it("flags malformed addresses", () => {
    expect(invalidEmails(["ok@x.com", "not-an-email", "also@"])).toEqual(["not-an-email", "also@"]);
  });
});

describe("pickScheduleVisit", () => {
  it("prefers the soonest live visit and ignores cancelled ones", () => {
    const visits = [
      { id: "old", starts_at: zonedToUtc("2026-11-10", 9 * 60), ends_at: zonedToUtc("2026-11-10", 11 * 60), status: "completed" },
      { id: "live", starts_at: starts, ends_at: ends, status: "scheduled" },
      { id: "later", starts_at: zonedToUtc("2026-11-20", 9 * 60), ends_at: zonedToUtc("2026-11-20", 11 * 60), status: "scheduled" },
      { id: "cx", starts_at: zonedToUtc("2026-11-13", 9 * 60), ends_at: zonedToUtc("2026-11-13", 11 * 60), status: "cancelled" },
    ];
    expect(pickScheduleVisit(visits)?.id).toBe("live");
  });

  it("returns null when every visit is cancelled", () => {
    expect(pickScheduleVisit([{ id: "cx", starts_at: starts, ends_at: ends, status: "cancelled" }])).toBeNull();
  });
});

describe("scheduleEmailBlockers", () => {
  const visit = { starts_at: starts, status: "scheduled" };
  it("requires both a visit and a customer email", () => {
    expect(scheduleEmailBlockers({ visit: null, customerEmail: null })).toMatch(/visit and add a customer email/i);
    expect(scheduleEmailBlockers({ visit: null, customerEmail: "a@x.com" })).toBe("Schedule a visit first.");
    expect(scheduleEmailBlockers({ visit, customerEmail: "" })).toBe("Add a customer email to send this.");
    expect(scheduleEmailBlockers({ visit: { ...visit, status: "cancelled" }, customerEmail: "a@x.com" })).toBe("Schedule a visit first.");
    expect(scheduleEmailBlockers({ visit, customerEmail: "dkowalski@egprecision.example" })).toBeNull();
  });
});

describe("work-description helpers", () => {
  it("strips a warranty/service prefix and capitalizes the title", () => {
    expect(cleanVisitTitle("Warranty — exit fixture batteries")).toBe("Exit fixture batteries");
    expect(cleanVisitTitle("Service - thermostat reset")).toBe("Thermostat reset");
    expect(cleanVisitTitle("")).toBe("");
  });

  it("drops crew photo/checklist lines from visit notes", () => {
    expect(customerFacingNotes(
      "Swap the battery packs in the 2 emergency fixtures at the rear exits (same model as the original install). Photo each fixture after a 90-minute test.",
    )).toBe("Swap the battery packs in the 2 emergency fixtures at the rear exits (same model as the original install).");
  });

  it("describes the arrival-window length", () => {
    expect(formatVisitDuration(starts, ends)).toBe("about 2 hours");
    expect(formatVisitDuration(starts, starts)).toBeNull();
  });
});

describe("schedule email draft", () => {
  it("writes a full default message for mock ticket SR-1004", () => {
    const draft = buildScheduleEmailDraft(sr1004DraftOpts);
    expect(draft.to).toBe("dkowalski@egprecision.example");
    expect(draft.cc).toEqual(["maria.santos@gmail.com"]);
    expect(draft.subject).toBe(`Your Retrofit Rebates service visit is scheduled for ${formatVisitDate(starts)}`);
    expect(draft.subject).toMatch(/Saturday, November 14, 2026/);
    expect(draft.body).toBe(SR1004_DEFAULT_BODY);
    expect(draft.body).toContain("Hi Dave,");
    expect(draft.body).toContain("We'll be on site for a warranty visit: Exit fixture batteries.");
    expect(draft.body).toContain("12-month warranty");
    expect(draft.body).toContain("LED Lighting");
    expect(draft.body).toContain("Office & breakroom LED troffer retrofit");
    expect(draft.body).toContain("Saturday, November 14, 2026, 9am–11am (Central Time)");
    expect(draft.body).toContain("Carlos Mendez");
    expect(draft.body).toContain("2250 Lunt Ave, Elk Grove Village, IL 60007");
    expect(draft.body).toContain("about 2 hours");
    expect(draft.body).toContain(COMPANY_PHONE);
    expect(draft.body).toContain(COMPANY_NAME);
    expect(draft.body).toContain(TEAM_SIGNOFF);
    expect(draft.body).not.toContain("Photo each fixture");
    expect(draft.body).not.toContain("To be assigned");
    expect(draft.body).not.toMatch(/Ticket: SR-1004/);
  });

  it("omits missing tech, address, phone, and warranty lines, and greets a company as 'there'", () => {
    const noCreator = buildScheduleEmailDraft({
      customerEmail: "a@x.com",
      creatorEmail: null,
      customerName: "Elk Grove Precision Machining",
      contactName: null,
      visit: { starts_at: starts, ends_at: ends, assignees: [], kind: "service" },
      address: "",
      ticketNumber: "SR-1001",
      companyPhone: "",
    });
    expect(noCreator.cc).toEqual([]);
    expect(noCreator.body).toContain("Hi there,");
    expect(noCreator.body).toContain("We'll be on site for a service visit.");
    expect(noCreator.body).not.toContain("Assigned technician");
    expect(noCreator.body).not.toContain("To be assigned");
    expect(noCreator.body).not.toContain("Service address");
    expect(noCreator.body).not.toContain("See your service address on file.");
    expect(noCreator.body).not.toContain("covered under your");
    expect(noCreator.body).toContain("just reply to this email.");
    expect(noCreator.body).not.toContain("call us at");
    expect(noCreator.body).toContain("Thank you,\nThe Retrofit Rebates Team");

    const same = buildScheduleEmailDraft({
      customerEmail: "a@x.com",
      creatorEmail: "A@x.com",
      customerName: "Acme",
      contactName: null,
      visit: { starts_at: starts, ends_at: ends },
      address: "1 Main",
      ticketNumber: "SR-1",
    });
    expect(same.cc).toEqual([]);
    expect(same.body).toContain("Hi Acme,");
    expect(same.body).toContain("Service address:\n1 Main");
  });

  it("wraps the editable body as HTML without executing tags, preserving line breaks and the body text", () => {
    const text = scheduleEmailBody({
      customerName: "Acme",
      contactName: "Ada <script>",
      startsAt: starts,
      endsAt: ends,
      address: "1 Main <office>",
      techNames: ["Pat"],
      ticketNumber: "SR-1",
      visitTitle: "Service — check panel",
    });
    const html = scheduleEmailHtml(text);
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toContain("viewport");
    expect(html).toContain("Hi Ada,");
    expect(html).toContain(escapeHtml("We'll be on site for a service visit: Check panel."));
    expect(html).toContain("1 Main &lt;office&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Retrofit Rebates, Inc.");
    expect(html).toContain("white-space:pre-wrap");
    for (const line of ["Hi Ada,", "Date and arrival window:", "Assigned technician:", "Pat", "Thank you,"]) {
      expect(html).toContain(line);
    }
  });

  it("includes the full SR-1004 body in both the plain text and the HTML send payload shape", () => {
    const text = buildScheduleEmailDraft(sr1004DraftOpts).body;
    const html = scheduleEmailHtml(text);
    expect(text).toBe(SR1004_DEFAULT_BODY);
    expect(html).toContain("Hi Dave,");
    expect(html).toContain(escapeHtml("We'll be on site for a warranty visit: Exit fixture batteries."));
    expect(html).toContain("12-month warranty");
    expect(html).toContain("Carlos Mendez");
    expect(html).toContain(TEAM_SIGNOFF);
    expect(html).toContain(escapeHtml("We're writing to confirm your upcoming service visit with Retrofit Rebates, Inc."));
    expect(html).toContain("white-space:pre-wrap");
  });
});

describe("history helpers", () => {
  it("formats the event line and finds the latest send", () => {
    expect(formatScheduleEmailEventBody("a@x.com", [])).toBe("Schedule email sent to a@x.com.");
    expect(formatScheduleEmailEventBody("a@x.com", ["b@y.com", "c@z.com"])).toBe(
      "Schedule email sent to a@x.com (cc b@y.com, c@z.com).",
    );
    const last = lastScheduleEmailEvent([
      { kind: "scheduled", created_at: "2026-11-12T00:00:00.000Z" },
      { kind: "emailed", created_at: "2026-11-13T15:00:00.000Z" },
      { kind: "emailed", created_at: "2026-11-13T18:00:00.000Z" },
      { kind: "note", created_at: "2026-11-13T19:00:00.000Z" },
    ]);
    expect(last?.created_at).toBe("2026-11-13T18:00:00.000Z");
    expect(lastScheduleEmailEvent([{ kind: "note", created_at: "2026-11-13T19:00:00.000Z" }])).toBeNull();
  });
});

describe("scheduleEmailSubject", () => {
  it("names the visit date in America/Chicago", () => {
    expect(scheduleEmailSubject(starts)).toBe(
      "Your Retrofit Rebates service visit is scheduled for Saturday, November 14, 2026",
    );
  });
});
