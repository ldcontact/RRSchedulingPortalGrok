import { describe, expect, it } from "vitest";
import { applicablePhotoRequirements, isRequirementOnVisit, missingPhotoRequirementLabels } from "./photo-requirements";

const project = { id: "r1", job_id: null, label: "T12 4ft" };
const visit = { id: "r2", job_id: "j3", label: "Panel close-up" };
const otherVisit = { id: "r3", job_id: "j9", label: "Other visit only" };
const photos = [
  { kind: "completion" as const, requirement_id: "r1" },
  { kind: "before" as const, requirement_id: "r2" },
];

describe("applicablePhotoRequirements", () => {
  const combined = [project, visit];

  it("includes project and visit items on an install visit", () => {
    expect(applicablePhotoRequirements("install", combined).map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("keeps only visit-specific items on warranty and service visits", () => {
    expect(applicablePhotoRequirements("warranty", combined).map((r) => r.id)).toEqual(["r2"]);
    expect(applicablePhotoRequirements("service", combined).map((r) => r.id)).toEqual(["r2"]);
  });

  it("treats a missing kind as install", () => {
    expect(applicablePhotoRequirements(undefined, combined)).toEqual(combined);
  });

  it("leaves a warranty visit with no visit items empty so the generic photo+note rule applies", () => {
    expect(applicablePhotoRequirements("warranty", [project])).toEqual([]);
  });
});

describe("isRequirementOnVisit", () => {
  it("accepts project-level items and this visit's items", () => {
    expect(isRequirementOnVisit(project, "j3")).toBe(true);
    expect(isRequirementOnVisit(visit, "j3")).toBe(true);
    expect(isRequirementOnVisit(otherVisit, "j3")).toBe(false);
  });
});

describe("missingPhotoRequirementLabels", () => {
  it("names items without a completion photo", () => {
    expect(missingPhotoRequirementLabels([project, visit], photos)).toEqual(["Panel close-up"]);
  });

  it("returns nothing when every item has a completion photo", () => {
    expect(missingPhotoRequirementLabels([project], photos)).toEqual([]);
  });
});
