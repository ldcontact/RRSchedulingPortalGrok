import { describe, expect, it } from "vitest";
import { projectHitLabel, projectHitSubtitle, toProjectHit } from "./project-hit";

describe("projectHit helpers", () => {
  it("formats subtitle with optional Housecall Pro job number", () => {
    expect(projectHitSubtitle({ customer_name: "Lakeview Family Dental", hcp_job_number: "367" }))
      .toBe("Lakeview Family Dental · Job #367");
    expect(projectHitSubtitle({ customer_name: "Lakeview Family Dental", hcp_job_number: null }))
      .toBe("Lakeview Family Dental");
  });

  it("unwraps a customers join and labels the pick", () => {
    const hit = toProjectHit({
      id: "p1", name: "LED retrofit – full office", status: "proposed", hcp_job_number: "367",
      customers: { name: "Lakeview Family Dental" },
    });
    expect(hit.customer_name).toBe("Lakeview Family Dental");
    expect(projectHitLabel(hit)).toBe("Lakeview Family Dental · LED retrofit – full office");
  });
});
