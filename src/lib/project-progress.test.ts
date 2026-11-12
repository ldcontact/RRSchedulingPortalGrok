import { describe, expect, it } from "vitest";
import { projectStepper, projectWhatsNext, visitStepper } from "./project-progress";

const job = (over: { id?: string; status: "scheduled" | "in_progress" | "completed" | "approved" | "cancelled"; kind?: "install" | "warranty"; starts_at?: string; title?: string }) => ({
  id: over.id ?? "j1",
  status: over.status,
  kind: over.kind ?? "install" as const,
  starts_at: over.starts_at ?? "2026-04-14T13:00:00Z",
  title: over.title ?? "Install visit",
});

describe("projectStepper", () => {
  it("starts on Scope when the scope is empty", () => {
    const steps = projectStepper({ status: "proposed", scope: "", jobs: [] });
    expect(steps.map((s) => s.state)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });
  it("moves to Scheduled after scope is written", () => {
    const steps = projectStepper({ status: "proposed", scope: "Swap fixtures", jobs: [] });
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("current");
  });
  it("sits on Review when a visit is submitted", () => {
    const steps = projectStepper({ status: "in_progress", scope: "Swap fixtures", jobs: [job({ status: "completed" })] });
    expect(steps.find((s) => s.label === "Review")?.state).toBe("current");
    expect(steps.find((s) => s.label === "Field work")?.state).toBe("done");
    expect(steps.find((s) => s.label === "Closeout")?.state).toBe("upcoming");
  });
  it("marks every step done when the project is complete", () => {
    const steps = projectStepper({ status: "complete", scope: "Done", jobs: [job({ status: "approved" })] });
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });
  it("stays on Field work when an approved visit is followed by more scheduled work", () => {
    const steps = projectStepper({
      status: "in_progress",
      scope: "Swap fixtures",
      jobs: [job({ status: "approved" }), job({ id: "j2", status: "scheduled" })],
    });
    expect(steps.find((s) => s.label === "Field work")?.state).toBe("current");
    expect(steps.find((s) => s.label === "Review")?.state).toBe("upcoming");
  });
});

describe("projectWhatsNext", () => {
  it("asks for scope first, then a visit, then review", () => {
    const base = { projectId: "p1", status: "proposed" as const, jobs: [], requirements: [], completionPhotos: [] };
    expect(projectWhatsNext({ ...base, scope: "" }).title).toMatch(/scope/i);
    expect(projectWhatsNext({ ...base, scope: "Work" }).href).toContain("/jobs/new");
    const review = projectWhatsNext({ ...base, status: "in_progress", scope: "Work", jobs: [job({ status: "completed" })] });
    expect(review.title).toMatch(/Review/i);
    expect(review.hrefLabel).toBe("Quality review");
  });
  it("surfaces required photo and approval counts from real data", () => {
    const next = projectWhatsNext({
      projectId: "p1",
      status: "in_progress",
      scope: "Work",
      jobs: [job({ status: "completed" }), job({ id: "j2", status: "approved" })],
      requirements: [{ id: "r1" }, { id: "r2" }],
      completionPhotos: [{ requirement_id: "r1" }],
    });
    expect(next.extras[0].label).toBe("Required photos 1 of 2");
    expect(next.extras[0].hrefLabel).toBe("View photos");
    expect(next.extras[1].label).toBe("Manager approval 1 of 2 visits");
    expect(next.extras[1].hrefLabel).toBe("Quality review");
  });
});

describe("visitStepper", () => {
  it("maps job status onto the four visit steps", () => {
    expect(visitStepper("scheduled")[0].state).toBe("current");
    expect(visitStepper("in_progress").map((s) => s.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(visitStepper("completed")[2].state).toBe("current");
    expect(visitStepper("approved")[3].state).toBe("current");
    expect(visitStepper("cancelled").every((s) => s.state === "upcoming")).toBe(true);
  });
});
