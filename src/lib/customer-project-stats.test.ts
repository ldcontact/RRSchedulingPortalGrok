import { describe, expect, it } from "vitest";
import { customerProjectStats } from "./customer-project-stats";
import type { ProjectStatus } from "./types";

const p = (status: ProjectStatus) => ({ status });

describe("customerProjectStats", () => {
  it("counts a customer like Hugo: one open project and no visits still shows 1 project, 0 completed", () => {
    expect(customerProjectStats([p("scheduled")])).toEqual({ total: 1, completed: 0 });
  });
  it("treats complete (closed) projects as completed, and ignores cancelled in both totals", () => {
    expect(customerProjectStats([
      p("complete"),
      p("in_progress"),
      p("awaiting_review"),
      p("cancelled"),
      p("proposed"),
    ])).toEqual({ total: 4, completed: 1 });
  });
  it("is empty when the customer has no projects", () => {
    expect(customerProjectStats([])).toEqual({ total: 0, completed: 0 });
  });
});
