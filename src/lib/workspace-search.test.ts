import { describe, expect, it } from "vitest";
import { parseSearch } from "./search";
import {
  customerSubtitle, emptyWorkspaceSearch, flattenWorkspaceHits, jobNumberLabel, matchesProfile,
  moveActive, personHref, personSubtitle, projectSubtitle, workspaceQuery,
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

describe("keyboard list", () => {
  it("flattens groups in Customers, Projects, People order", () => {
    const r = emptyWorkspaceSearch();
    r.customers.items = [{ id: "c1", kind: "customer", title: "A", subtitle: "", href: "/customers/c1" }];
    r.projects.items = [{ id: "p1", kind: "project", title: "B", subtitle: "", href: "/projects/p1" }];
    r.people.items = [{ id: "u1", kind: "person", title: "C", subtitle: "", href: "/team" }];
    expect(flattenWorkspaceHits(r).map((h) => h.id)).toEqual(["c1", "p1", "u1"]);
  });
  it("wraps up/down", () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});
