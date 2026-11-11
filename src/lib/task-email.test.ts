import { describe, expect, it } from "vitest";
import {
  addedAssigneeIds,
  buildTaskEmail,
  describeTaskChanges,
  involvedProfileIds,
  newTaskMessageId,
  normalizeMessageId,
  shouldEmailAssignee,
  TASK_EMAIL_BASE,
  taskEmailSubject,
  taskUrl,
  threadingHeaders,
  type TaskSnapshot,
} from "./task-email";

const names: Record<string, string> = { "u-admin": "Luke Dlugosz", "u-manager": "Maria Santos", "u-tech1": "Carlos Mendez" };
const nameOf = (id: string) => names[id] ?? id;

const snap = (over: Partial<TaskSnapshot> = {}): TaskSnapshot => ({
  title: "Call ComEd about rebate paperwork",
  description: "Ask for the missing invoice.",
  status: "open",
  priority: "high",
  due_date: "2026-11-12",
  assignee_ids: ["u-tech1"],
  ...over,
});

describe("task email", () => {
  it("uses a stable Task: subject, production link, and body with title, due date, and assigner", () => {
    const mail = buildTaskEmail({
      id: "t1",
      title: "Call ComEd about rebate paperwork",
      due_date: "2026-11-12",
      priority: "high",
      actorName: "Maria Santos",
      description: "Ask for the missing invoice.",
      kind: "created",
    });
    expect(mail.subject).toBe("Task: Call ComEd about rebate paperwork");
    expect(taskEmailSubject("  ")).toBe("Task: Untitled task");
    expect(mail.url).toBe(`${TASK_EMAIL_BASE}/tasks/t1`);
    expect(taskUrl("abc")).toBe("https://rr-scheduling-portal-grokv1.vercel.app/tasks/abc");
    expect(mail.text).toContain("Maria Santos assigned you a task");
    expect(mail.text).toContain("Priority: High");
    expect(mail.text).toContain("Due:");
    expect(mail.text).toContain(mail.url);
    expect(mail.html).toContain("Open task");
    expect(mail.html).toContain(mail.url);
  });

  it("summarizes field changes and a comment for later messages in the same thread", () => {
    const changes = describeTaskChanges(
      snap(),
      snap({ status: "in_progress", due_date: "2026-11-14", assignee_ids: ["u-tech1", "u-manager"] }),
      nameOf,
    );
    expect(changes.map((c) => c.field)).toEqual(["status", "due_date", "assignees"]);
    expect(changes.find((c) => c.field === "status")).toMatchObject({ from: "Open", to: "In progress" });
    expect(changes.find((c) => c.field === "assignees")?.to).toContain("Maria Santos");

    const update = buildTaskEmail({
      id: "t1", title: snap().title, due_date: "2026-11-14", priority: "high",
      actorName: "Maria Santos", kind: "updated", changes,
    });
    expect(update.subject).toBe("Task: Call ComEd about rebate paperwork");
    expect(update.text).toContain("Maria Santos updated a task");
    expect(update.text).toContain("What changed:");
    expect(update.text).toContain("Status: Open → In progress");
    expect(update.html).toContain("What changed");

    const comment = buildTaskEmail({
      id: "t1", title: snap().title, due_date: "2026-11-14", priority: "high",
      actorName: "Carlos Mendez", kind: "comment", commentBody: "I'll pick them up Thursday.",
    });
    expect(comment.subject).toBe(update.subject);
    expect(comment.text).toContain("Carlos Mendez commented on a task");
    expect(comment.text).toContain("I'll pick them up Thursday.");
  });

  it("emails everyone involved except the person who made the change", () => {
    expect(involvedProfileIds({ assignee_ids: ["u-tech1", "u-manager"], created_by: "u-admin" }, "u-manager")).toEqual(["u-admin", "u-tech1"]);
    expect(involvedProfileIds({ assignee_ids: ["u-admin"], created_by: "u-admin" }, "u-admin")).toEqual([]);
  });

  it("skips email when there is no assignee, the actor is the assignee, or the assignee was already on the task", () => {
    expect(shouldEmailAssignee({ assigneeId: null, actorId: "u-admin" })).toBe(false);
    expect(shouldEmailAssignee({ assigneeId: "u-admin", actorId: "u-admin" })).toBe(false);
    expect(shouldEmailAssignee({ assigneeId: "u-tech1", actorId: "u-admin" })).toBe(true);
    expect(shouldEmailAssignee({ assigneeId: "u-tech1", actorId: "u-admin", previousAssigneeIds: ["u-tech1"] })).toBe(false);
    expect(shouldEmailAssignee({ assigneeId: "u-tech2", actorId: "u-admin", previousAssigneeIds: ["u-tech1"] })).toBe(true);
  });

  it("still reports newly added assignees for change summaries", () => {
    expect(addedAssigneeIds(["u-tech1", "u-tech2", "u-admin"], undefined, "u-admin")).toEqual(["u-tech1", "u-tech2"]);
    expect(addedAssigneeIds(["u-tech1", "u-tech2"], ["u-tech1"], "u-admin")).toEqual(["u-tech2"]);
    expect(addedAssigneeIds(["u-tech1"], ["u-tech1", "u-tech2"], "u-admin")).toEqual([]);
  });

  it("mints a root Message-ID and threads later messages with In-Reply-To / References", () => {
    const root = newTaskMessageId("t1");
    expect(root).toMatch(/^<task\.t1\.[a-z0-9]+@rr-scheduling-portal-grokv1\.vercel\.app>$/);
    expect(normalizeMessageId("abc@x.com")).toBe("<abc@x.com>");
    expect(normalizeMessageId(root)).toBe(root);
    expect(threadingHeaders({ rootMessageId: root, isRoot: true, taskId: "t1" })).toEqual({ messageId: root });
    const later = threadingHeaders({ rootMessageId: root, isRoot: false, taskId: "t1" });
    expect(later.messageId).not.toBe(root);
    expect(later.inReplyTo).toBe(root);
    expect(later.references).toBe(root);
  });
});
