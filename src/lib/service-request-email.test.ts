import { describe, expect, it } from "vitest";
import { zonedToUtc } from "@/lib/time";
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_NAME,
  COMPANY_PHONE,
  buildScheduleEmailDraft,
  formatScheduleEmailEventBody,
  formatVisitDate,
  invalidEmails,
  lastScheduleEmailEvent,
  parseEmailList,
  pickScheduleVisit,
  scheduleEmailBlockers,
  scheduleEmailBody,
  scheduleEmailHtml,
  scheduleEmailSubject,
} from "@/lib/service-request-email";

const starts = zonedToUtc("2026-11-14", 9 * 60);
const ends = zonedToUtc("2026-11-14", 11 * 60);

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

describe("schedule email draft", () => {
  it("builds the subject, body, To, and creator CC", () => {
    const draft = buildScheduleEmailDraft({
      customerEmail: "dkowalski@egprecision.example",
      creatorEmail: "maria.santos@gmail.com",
      customerName: "Elk Grove Precision Machining",
      contactName: "Dave Kowalski",
      visit: { starts_at: starts, ends_at: ends, assignees: [{ full_name: "Carlos Mendez" }] },
      address: "2250 Lunt Ave, Elk Grove Village, IL 60007",
      ticketNumber: "SR-1004",
    });
    expect(draft.to).toBe("dkowalski@egprecision.example");
    expect(draft.cc).toEqual(["maria.santos@gmail.com"]);
    expect(draft.subject).toBe(`Your Retrofit Rebates service visit is scheduled for ${formatVisitDate(starts)}`);
    expect(draft.subject).toMatch(/Saturday, November 14, 2026/);
    expect(draft.body).toContain("Hi Dave,");
    expect(draft.body).toContain("Saturday, November 14, 2026, 9am–11am");
    expect(draft.body).toContain("2250 Lunt Ave, Elk Grove Village, IL 60007");
    expect(draft.body).toContain("Carlos Mendez");
    expect(draft.body).toContain("Ticket: SR-1004");
    expect(draft.body).toContain(COMPANY_NAME);
    expect(draft.body).toContain(COMPANY_ADDRESS);
    expect(draft.body).toContain(COMPANY_PHONE);
    expect(draft.body).toContain(COMPANY_EMAIL);
  });

  it("omits a missing or identical creator from CC and falls back to 'To be assigned'", () => {
    const noCreator = buildScheduleEmailDraft({
      customerEmail: "a@x.com",
      creatorEmail: null,
      customerName: "Acme",
      contactName: null,
      visit: { starts_at: starts, ends_at: ends, assignees: [] },
      address: "",
      ticketNumber: "SR-1001",
    });
    expect(noCreator.cc).toEqual([]);
    expect(noCreator.body).toContain("Hi Acme,");
    expect(noCreator.body).toContain("To be assigned");
    expect(noCreator.body).toContain("See your service address on file.");

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
  });

  it("wraps the editable body as HTML without executing tags", () => {
    const html = scheduleEmailHtml(scheduleEmailBody({
      customerName: "Acme",
      contactName: "Ada <script>",
      startsAt: starts,
      endsAt: ends,
      address: "1 Main",
      techNames: ["Pat"],
      ticketNumber: "SR-1",
    }));
    expect(html).toContain("Hi Ada,");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Retrofit Rebates");
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
