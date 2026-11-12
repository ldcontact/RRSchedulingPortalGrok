import { describe, expect, it } from "vitest";
import { customerDeleteBlockers, hasDeleteAccess, visitDeleteConsequences } from "./delete-access";

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

describe("visitDeleteConsequences", () => {
  it("lists visit, photos, files, notes, and visit-level required photos", () => {
    expect(visitDeleteConsequences({
      photoCount: 2, fileCount: 1, visitRequirementCount: 2, linkedToServiceRequest: true,
    })).toEqual([
      "This visit is removed. The project and other visits stay.",
      "2 photos from this visit (files are removed from storage)",
      "1 document on this visit (files are removed from storage)",
      "Notes and assignments for this visit are removed",
      "2 visit-specific required photos are removed. The project checklist stays.",
      "The linked service request stays in the inbox (the visit link is cleared)",
    ]);
  });

  it("uses empty-state wording when a visit has no attachments", () => {
    expect(visitDeleteConsequences({
      photoCount: 0, fileCount: 0, visitRequirementCount: 0, linkedToServiceRequest: false,
    })).toEqual([
      "This visit is removed. The project and other visits stay.",
      "No photos are attached to this visit",
      "No documents are attached to this visit",
      "Notes and assignments for this visit are removed",
      "Visit-specific required photos for this visit are removed, if any. The project checklist stays.",
    ]);
  });
});
