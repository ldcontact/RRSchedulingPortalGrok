import { describe, expect, it } from "vitest";
import { parseSearch } from "./search";
import {
  customerSubtitle, dealSubtitle, emptyWorkspaceSearch, flattenWorkspaceHits, jobNumberLabel,
  matchesDealSearch, matchesProfile, matchesServiceRequestSearch, matchesTaskSearch, matchesVisitSearch,
  moveActive, personHref, personSubtitle, projectSubtitle, serviceRequestSearchFields, serviceRequestSubtitle,
  serviceRequestTitle, taskSearchDoc, taskSubtitle, ticketNumberFromToken, visitSubtitle, workspaceQuery,
} from "./workspace-search";

describe("workspaceQuery", () => {
  it("treats blank as no query", () => {
    expect(workspaceQuery("  ")).toBeNull();
  });
  it("keeps short job-number tokens (not a phone)", () => {
    expect(parseSearch("367")?.tokens).toEqual(["367"]);
    expect(parseSearch("367")?.digits).toBeNull();
  });
});

describe("job number and subtitles", () => {
  it("labels Housecall Pro job numbers", () => {
    expect(jobNumberLabel("367")).toBe("Job #367");
    expect(jobNumberLabel("#367")).toBe("Job #367");
    expect(jobNumberLabel("")).toBeNull();
  });
  it("builds customer / project / person subtitles", () => {
    expect(customerSubtitle({ address: "1420 W Algonquin Rd", city: "Arlington Heights", state: "IL", zip: "60005" })).toContain("1420 W Algonquin");
    expect(projectSubtitle({ customer_name: "Lakeview Family Dental", hcp_job_number: "367", address: "1420 W Algonquin Rd" })).toBe("Lakeview Family Dental · Job #367 · 1420 W Algonquin Rd");
    expect(personSubtitle({ role: "tech", email: "carlos.mendez@yahoo.com", title: "Lead Electrician" })).toBe("Lead Electrician · carlos.mendez@yahoo.com");
  });
});

describe("people matching", () => {
  const carlos = { full_name: "Carlos Mendez", email: "carlos.mendez@yahoo.com" };
  it("matches name and email", () => {
    expect(matchesProfile(carlos, parseSearch("mendez")!)).toBe(true);
    expect(matchesProfile(carlos, parseSearch("Carlos")!)).toBe(true);
    expect(matchesProfile(carlos, parseSearch("carlos.mendez@")!)).toBe(true);
    expect(matchesProfile(carlos, parseSearch("luke")!)).toBe(false);
  });
});

describe("personHref", () => {
  it("sends staff to the team directory, techs to their own profile only", () => {
    expect(personHref({ profileId: "u-tech1", viewerId: "u-admin", staff: true })).toBe("/team");
    expect(personHref({ profileId: "u-tech1", viewerId: "u-tech1", staff: false })).toBe("/account");
    expect(personHref({ profileId: "u-tech2", viewerId: "u-tech1", staff: false })).toBeNull();
  });
});

describe("service request matching", () => {
  const sr = {
    number: 1002,
    summary: "Paint booth RTU short-cycling",
    description: "Tony called: the paint booth unit turns on and off every few minutes since the cold snap.",
    customer_name: "Golf Road Auto Body",
    contact_name: "Tony Ricci",
    contact_phone: "(847) 555-0199",
    site_address: "920 Golf Rd",
    site_city: "Schaumburg",
    site_state: "IL",
    site_zip: "60173",
    project_name: "Paint booth RTU replacement",
    assignee_name: "Priya Shah",
  };
  it("parses SR-1002, sr-1002, and 1002 as a ticket number", () => {
    expect(ticketNumberFromToken("SR-1002")).toBe("1002");
    expect(ticketNumberFromToken("sr-1002")).toBe("1002");
    expect(ticketNumberFromToken("1002")).toBe("1002");
    expect(ticketNumberFromToken("paint")).toBeNull();
  });
  it("matches ticket number, title, description, customer name, and address", () => {
    expect(matchesServiceRequestSearch(sr, parseSearch("SR-1002")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("sr-1002")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("1002")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("paint booth")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("short-cycling")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("cold snap")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("Golf Road")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("920 Golf")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("Schaumburg")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("60173")!)).toBe(true);
    expect(matchesServiceRequestSearch(sr, parseSearch("lakeview")!)).toBe(false);
  });
  it("does not put a service price into the search document", () => {
    const doc = serviceRequestSearchFields({ ...sr, amount: 4800 } as typeof sr & { amount: number }).doc;
    expect(doc).not.toContain("4800");
    expect(doc).not.toContain("price");
  });
  it("builds a titled row that opens the ticket", () => {
    expect(serviceRequestTitle(sr)).toBe("SR-1002 · Paint booth RTU short-cycling");
    expect(serviceRequestSubtitle({ ...sr, status: "triaged" })).toContain("Triaged");
    expect(serviceRequestSubtitle({ ...sr, status: "triaged" })).toContain("Golf Road Auto Body");
    expect(serviceRequestSubtitle({ ...sr, status: "triaged" })).toContain("920 Golf Rd");
  });
});

describe("task matching", () => {
  const task = {
    title: "Call ComEd about Lakeview rebate paperwork",
    description: "They are missing the final invoice for the office retrofit.",
    assignee_names: ["Luke Diaz", "Priya Shah"],
    project_name: "Office LED retrofit",
    customer_name: "Lakeview Family Dental",
    service_request_number: 1004,
    service_request_summary: "Exit fixtures not holding battery",
  };
  it("matches title, description, assignee, and related project or ticket", () => {
    expect(matchesTaskSearch(task, parseSearch("ComEd")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("final invoice")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("Priya")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("Office LED")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("Lakeview")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("SR-1004")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("exit fixtures")!)).toBe(true);
    expect(matchesTaskSearch(task, parseSearch("paint booth")!)).toBe(false);
  });
  it("builds a subtitle with status, assignees, and project — never a price", () => {
    const sub = taskSubtitle({ status: "open", assignee_names: task.assignee_names, project_name: task.project_name });
    expect(sub).toBe("Open · Luke Diaz, Priya Shah · Office LED retrofit");
    expect(taskSearchDoc(task)).not.toMatch(/\$|price|rebate amount/i);
  });
});

describe("visit matching", () => {
  const visit = {
    title: "Office troffers (day 1)",
    kind: "install" as const,
    status: "approved" as const,
    project_name: "Office & breakroom LED troffer retrofit",
    customer_name: "Elk Grove Precision",
    address: "2250 Lunt Ave",
    city: "Elk Grove Village",
    state: "IL",
    zip: "60007",
    assignee_names: ["Carlos Mendez"],
  };
  it("matches visit title, project, customer, address, and assignee", () => {
    expect(matchesVisitSearch(visit, parseSearch("troffers")!)).toBe(true);
    expect(matchesVisitSearch(visit, parseSearch("Elk Grove")!)).toBe(true);
    expect(matchesVisitSearch(visit, parseSearch("2250 Lunt")!)).toBe(true);
    expect(matchesVisitSearch(visit, parseSearch("Carlos")!)).toBe(true);
    expect(matchesVisitSearch(visit, parseSearch("paint booth")!)).toBe(false);
  });
  it("builds a visit subtitle without calling it a job heading", () => {
    const sub = visitSubtitle({ kind: "warranty", starts_at: "2026-11-14T15:00:00.000Z", customer_name: "Golf Road Auto Body", address: "920 Golf Rd" });
    expect(sub).toContain("Warranty");
    expect(sub).toContain("Golf Road Auto Body");
    expect(sub).toContain("920 Golf Rd");
    expect(sub.toLowerCase()).not.toContain("job #");
  });
});

describe("deal matching", () => {
  const deal = {
    title: "4821 Birchwood Ave",
    contact_name: "Elena Vasquez",
    contact_phone: "(847) 555-0142",
    contact_email: "elena.vasquez@example.com",
    address: "4821 Birchwood Ave",
    city: "Schaumburg",
    state: "IL",
    zip: "60193",
  };
  it("matches title, contact, and address, including a formatted phone", () => {
    expect(matchesDealSearch(deal, parseSearch("Birchwood")!)).toBe(true);
    expect(matchesDealSearch(deal, parseSearch("Elena")!)).toBe(true);
    expect(matchesDealSearch(deal, parseSearch("Schaumburg")!)).toBe(true);
    expect(matchesDealSearch(deal, parseSearch("847-555-0142")!)).toBe(true);
    expect(matchesDealSearch(deal, parseSearch("paint booth")!)).toBe(false);
  });
  it("subtitle is contact and address, never a dollar amount", () => {
    const sub = dealSubtitle(deal);
    expect(sub).toContain("Elena Vasquez");
    expect(sub).toContain("4821 Birchwood");
    expect(sub).not.toMatch(/\$|2450|1850/);
  });
});

describe("keyboard list", () => {
  it("flattens groups in Customers, Projects, Visits, Service requests, Tasks, Deals, People order", () => {
    const r = emptyWorkspaceSearch();
    r.customers.items = [{ id: "c1", kind: "customer", title: "A", subtitle: "", href: "/customers/c1" }];
    r.projects.items = [{ id: "p1", kind: "project", title: "B", subtitle: "", href: "/projects/p1" }];
    r.visits.items = [{ id: "j1", kind: "visit", title: "V", subtitle: "", href: "/jobs/j1" }];
    r.serviceRequests.items = [{ id: "sr1", kind: "service_request", title: "SR-1001", subtitle: "", href: "/service-requests/sr1" }];
    r.tasks.items = [{ id: "t1", kind: "task", title: "T", subtitle: "", href: "/tasks/t1" }];
    r.deals.items = [{ id: "d1", kind: "deal", title: "D", subtitle: "", href: "/sales/deals/d1" }];
    r.people.items = [{ id: "u1", kind: "person", title: "C", subtitle: "", href: "/team" }];
    expect(flattenWorkspaceHits(r).map((h) => h.id)).toEqual(["c1", "p1", "j1", "sr1", "t1", "d1", "u1"]);
  });
  it("wraps up/down", () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});
