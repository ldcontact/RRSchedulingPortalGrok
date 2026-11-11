import { describe, expect, it } from "vitest";
import { customerDeleteBlockers, hasDeleteAccess } from "./delete-access";

describe("hasDeleteAccess", () => {
  it("admins always have access, even when the flag is off", () => {
    expect(hasDeleteAccess({ role: "admin", can_delete: false })).toBe(true);
    expect(hasDeleteAccess({ role: "admin", can_delete: true })).toBe(true);
  });

  it("managers need the admin-granted flag", () => {
    expect(hasDeleteAccess({ role: "manager", can_delete: false })).toBe(false);
    expect(hasDeleteAccess({ role: "manager", can_delete: true })).toBe(true);
  });

  it("techs and others never have access, even if the flag is set", () => {
    expect(hasDeleteAccess({ role: "tech", can_delete: false })).toBe(false);
    expect(hasDeleteAccess({ role: "tech", can_delete: true })).toBe(false);
    expect(hasDeleteAccess({ role: null, can_delete: true })).toBe(false);
  });
});

describe("customerDeleteBlockers", () => {
  it("blocks when projects exist, preferring that message over service requests", () => {
    expect(customerDeleteBlockers({ projects: 2, serviceRequests: 3 }))
      .toBe("This customer has 2 projects. Delete or move them first.");
    expect(customerDeleteBlockers({ projects: 1, serviceRequests: 0 }))
      .toBe("This customer has 1 project. Delete or move it first.");
  });

  it("blocks leftover service requests when there are no projects", () => {
    expect(customerDeleteBlockers({ projects: 0, serviceRequests: 1 }))
      .toBe("This customer has 1 service request. Delete it first.");
  });

  it("returns null when the customer is clear", () => {
    expect(customerDeleteBlockers({ projects: 0, serviceRequests: 0 })).toBeNull();
  });
});
