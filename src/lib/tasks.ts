import { TASK_ACTIVE, type Role, type Task, type TaskDueFilter, type TaskPageFilter, type TaskPriority, type TaskStatus } from "@/lib/types";
import { todayKey, validDay } from "@/lib/time";

export function canViewTask(user: { id: string; role?: Role | null }, task: Pick<Task, "assignee_id" | "created_by">): boolean {
  if (user.role === "admin" || user.role === "manager") return true;
  return task.assignee_id === user.id || task.created_by === user.id;
}

/** Staff can edit all fields; techs may only change status on tasks they can see. */
export function canEditTask(user: { id: string; role?: Role | null }): boolean {
  return user.role === "admin" || user.role === "manager";
}

export function canUpdateTaskStatus(user: { id: string; role?: Role | null }, task: Pick<Task, "assignee_id" | "created_by">): boolean {
  if (canEditTask(user)) return true;
  return canViewTask(user, task);
}

export function isTaskOverdue(task: Pick<Task, "due_date" | "status">, today = todayKey()): boolean {
  return !!task.due_date && validDay(task.due_date) && task.due_date < today && task.status !== "done";
}

export function dueBucket(task: Pick<Task, "due_date" | "status">, today = todayKey()): TaskDueFilter | "later" {
  if (!task.due_date) return "none";
  if (isTaskOverdue(task, today)) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date > today) return "upcoming";
  return "later";
}

export function matchesTaskFilters(task: Task, f: Omit<TaskPageFilter, "page" | "size">, userId: string, today = todayKey()): boolean {
  if (f.tab === "mine" && task.assignee_id !== userId) return false;
  if (f.status === "active" || !f.status) {
    if (!TASK_ACTIVE.includes(task.status)) return false;
  } else if (task.status !== f.status) return false;
  if (f.assignee === "none") {
    if (task.assignee_id) return false;
  } else if (f.assignee && task.assignee_id !== f.assignee) return false;
  if (f.due && dueBucket(task, today) !== f.due) return false;
  if (f.projectId && task.project_id !== f.projectId) return false;
  if (f.customerId && task.customer_id !== f.customerId) return false;
  if (f.q?.trim()) {
    const q = f.q.trim().toLowerCase();
    const hay = [task.title, task.description ?? ""].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Due date ascending, overdue first naturally; tasks without a due date last. Then priority (high first), then created. */
export function compareTasksByDue(a: Task, b: Task): number {
  const da = a.due_date ?? "9999-99-99";
  const db = b.due_date ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  const pr: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
  if (pr[a.priority] !== pr[b.priority]) return pr[a.priority] - pr[b.priority];
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

export function completedAtFor(status: TaskStatus, previous: string | null, now = new Date().toISOString()): string | null {
  if (status === "done") return previous ?? now;
  return null;
}

export function parseTaskStatus(raw: string | null | undefined): TaskStatus | null {
  return raw === "open" || raw === "in_progress" || raw === "done" ? raw : null;
}

export function parseTaskPriority(raw: string | null | undefined): TaskPriority | null {
  return raw === "low" || raw === "normal" || raw === "high" ? raw : null;
}

export function isMyOpenTask(task: Pick<Task, "assignee_id" | "status">, userId: string): boolean {
  return task.assignee_id === userId && TASK_ACTIVE.includes(task.status);
}

export function taskCounts(tasks: Task[], userId: string) {
  const counts: Record<string, number> = { mine: 0, all: tasks.length, open: 0, in_progress: 0, done: 0, active: 0, overdue: 0 };
  for (const t of tasks) {
    if (t.assignee_id === userId && TASK_ACTIVE.includes(t.status)) counts.mine++;
    counts[t.status] = (counts[t.status] ?? 0) + 1;
    if (TASK_ACTIVE.includes(t.status)) counts.active++;
    if (isTaskOverdue(t)) counts.overdue++;
  }
  return counts;
}

export { todayKey };
