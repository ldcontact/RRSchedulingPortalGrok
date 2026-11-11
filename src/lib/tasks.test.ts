import { describe, expect, it } from "vitest";
import { canEditTask, canUpdateTaskStatus, canViewTask, compareTasksByDue, completedAtFor, hasAssignee, isMyOpenTask, isTaskOverdue, matchesTaskFilters, normalizeAssigneeIds, taskCounts } from "./tasks";
import type { Task } from "./types";

const base = (over: Partial<Task> = {}): Task => ({
  id: "t1", title: "Do the thing", description: null, status: "open", priority: "normal",
  due_date: "2026-11-12", assignee_ids: ["u-tech1"], created_by: "u-admin",
  project_id: null, customer_id: null, service_request_id: null,
  completed_at: null, email_message_id: null, created_at: "2026-11-10T12:00:00.000Z", updated_at: "2026-11-10T12:00:00.000Z",
  ...over,
});

describe("task access", () => {
  it("lets staff see every task and techs see assigned or created ones, including as one of several assignees", () => {
    const t = base({ assignee_ids: ["u-tech1", "u-tech3"] });
    expect(canViewTask({ id: "u-admin", role: "admin" }, t)).toBe(true);
    expect(canViewTask({ id: "u-manager", role: "manager" }, t)).toBe(true);
    expect(canViewTask({ id: "u-tech1", role: "tech" }, t)).toBe(true);
    expect(canViewTask({ id: "u-tech3", role: "tech" }, t)).toBe(true);
    expect(canViewTask({ id: "u-tech2", role: "tech" }, t)).toBe(false);
    expect(canViewTask({ id: "u-tech2", role: "tech" }, base({ created_by: "u-tech2", assignee_ids: [] }))).toBe(true);
  });

  it("lets techs update status but not edit fields on their tasks", () => {
    const t = base();
    expect(canEditTask({ id: "u-tech1", role: "tech" })).toBe(false);
    expect(canUpdateTaskStatus({ id: "u-tech1", role: "tech" }, t)).toBe(true);
    expect(canUpdateTaskStatus({ id: "u-tech2", role: "tech" }, t)).toBe(false);
    expect(canEditTask({ id: "u-admin", role: "admin" })).toBe(true);
  });
});

describe("due dates", () => {
  it("marks a dated open task overdue before today and ignores done ones", () => {
    expect(isTaskOverdue(base({ due_date: "2026-11-10", status: "open" }), "2026-11-11")).toBe(true);
    expect(isTaskOverdue(base({ due_date: "2026-11-11", status: "open" }), "2026-11-11")).toBe(false);
    expect(isTaskOverdue(base({ due_date: "2026-11-10", status: "done" }), "2026-11-11")).toBe(false);
    expect(isTaskOverdue(base({ due_date: null }), "2026-11-11")).toBe(false);
  });

  it("sorts by due date with undated tasks last", () => {
    const a = base({ id: "a", due_date: "2026-11-20", priority: "high" });
    const b = base({ id: "b", due_date: "2026-11-10", priority: "low" });
    const c = base({ id: "c", due_date: null, priority: "high" });
    expect([a, c, b].sort(compareTasksByDue).map((t) => t.id)).toEqual(["b", "a", "c"]);
  });
});

describe("filters", () => {
  it("filters my tab as any assignee, unassigned, a specific assignee, and due bucket", () => {
    const mine = base({ assignee_ids: ["u-admin", "u-tech1"], due_date: "2026-11-10" });
    const other = base({ id: "t2", assignee_ids: ["u-tech1"], due_date: "2026-11-20" });
    const done = base({ id: "t3", assignee_ids: ["u-admin"], status: "done", due_date: "2026-11-09" });
    const open = base({ id: "t4", assignee_ids: [], due_date: "2026-11-20" });
    const rows = [mine, other, done, open];
    const f = { tab: "mine" as const, status: "active" as const };
    expect(rows.filter((t) => matchesTaskFilters(t, f, "u-admin", "2026-11-11")).map((t) => t.id)).toEqual(["t1"]);
    expect(rows.filter((t) => matchesTaskFilters(t, { tab: "mine", status: "active" }, "u-tech1", "2026-11-11")).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(rows.filter((t) => matchesTaskFilters(t, { assignee: "none" }, "u-admin", "2026-11-11")).map((t) => t.id)).toEqual(["t4"]);
    expect(rows.filter((t) => matchesTaskFilters(t, { assignee: "u-tech1" }, "u-admin", "2026-11-11")).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(rows.filter((t) => matchesTaskFilters(t, { due: "overdue" }, "u-admin", "2026-11-11")).map((t) => t.id)).toEqual(["t1"]);
    expect(isMyOpenTask(mine, "u-admin")).toBe(true);
    expect(isMyOpenTask(done, "u-admin")).toBe(false);
    expect(taskCounts(rows, "u-admin").mine).toBe(1);
    expect(taskCounts(rows, "u-tech1").mine).toBe(2);
  });
});

describe("completed_at", () => {
  it("stamps completed_at when moving to done and clears it otherwise", () => {
    expect(completedAtFor("done", null, "2026-11-11T18:00:00.000Z")).toBe("2026-11-11T18:00:00.000Z");
    expect(completedAtFor("done", "2026-11-10T12:00:00.000Z", "2026-11-11T18:00:00.000Z")).toBe("2026-11-10T12:00:00.000Z");
    expect(completedAtFor("open", "2026-11-10T12:00:00.000Z")).toBeNull();
  });
});

describe("normalizeAssigneeIds", () => {
  it("trims, drops blanks, and de-duplicates", () => {
    expect(normalizeAssigneeIds([" u-a ", "", "u-b", "u-a"])).toEqual(["u-a", "u-b"]);
    expect(normalizeAssigneeIds(undefined)).toEqual([]);
    expect(hasAssignee(base({ assignee_ids: ["u-a", "u-b"] }), "u-b")).toBe(true);
  });
});
