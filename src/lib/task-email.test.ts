import { describe, expect, it } from "vitest";
import { buildTaskEmail, shouldEmailAssignee, TASK_EMAIL_BASE, taskEmailSubject, taskUrl } from "./task-email";

describe("task email", () => {
  it("builds a subject, production link, and body with title, due date, priority, and assigner", () => {
    const mail = buildTaskEmail({
      id: "t1",
      title: "Call ComEd about rebate paperwork",
      due_date: "2026-11-12",
      priority: "high",
      assignerName: "Maria Santos",
      description: "Ask for the missing invoice.",
    });
    expect(mail.subject).toBe("New task: Call ComEd about rebate paperwork");
    expect(mail.url).toBe(`${TASK_EMAIL_BASE}/tasks/t1`);
    expect(taskUrl("abc")).toBe("https://rr-scheduling-portal-grokv1.vercel.app/tasks/abc");
    expect(mail.text).toContain("Maria Santos assigned you a task");
    expect(mail.text).toContain("Priority: High");
    expect(mail.text).toContain("Due:");
    expect(mail.text).toContain(mail.url);
    expect(mail.html).toContain("Open task");
    expect(mail.html).toContain(mail.url);
    expect(taskEmailSubject("  ")).toBe("New task: Untitled task");
  });

  it("skips email when there is no assignee, the actor is the assignee, or the assignee did not change", () => {
    expect(shouldEmailAssignee({ assigneeId: null, actorId: "u-admin" })).toBe(false);
    expect(shouldEmailAssignee({ assigneeId: "u-admin", actorId: "u-admin" })).toBe(false);
    expect(shouldEmailAssignee({ assigneeId: "u-tech1", actorId: "u-admin" })).toBe(true);
    expect(shouldEmailAssignee({ assigneeId: "u-tech1", actorId: "u-admin", previousAssigneeId: "u-tech1" })).toBe(false);
    expect(shouldEmailAssignee({ assigneeId: "u-tech2", actorId: "u-admin", previousAssigneeId: "u-tech1" })).toBe(true);
  });
});
