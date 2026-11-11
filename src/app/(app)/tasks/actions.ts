"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDeleteAccess, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { scheduleTaskAssigneeEmail } from "@/lib/task-notify";
import { canEditTask, canUpdateTaskStatus, parseTaskPriority, parseTaskStatus } from "@/lib/tasks";
import { validDay } from "@/lib/time";
import type { TaskInput, TaskPatch } from "@/lib/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (v: string) => (v ? v : null);

function refresh(id?: string) {
  revalidatePath("/tasks", "layout");
  revalidatePath("/");
  if (id) revalidatePath(`/tasks/${id}`);
}

function back(path: string, msg: string, kind: "ok" | "error" = "ok"): never {
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}${kind}=${encodeURIComponent(msg)}`);
}

async function assigneeEmail(repo: Awaited<ReturnType<typeof getRepo>>, id: string | null) {
  if (!id) return null;
  const p = await repo.getProfile(id);
  return p?.email ?? null;
}

function formInput(fd: FormData): TaskInput {
  const status = parseTaskStatus(s(fd, "status")) ?? "open";
  const priority = parseTaskPriority(s(fd, "priority")) ?? "normal";
  const due = s(fd, "due_date");
  return {
    title: s(fd, "title").slice(0, 200),
    description: orNull(s(fd, "description").slice(0, 5000)),
    status,
    priority,
    due_date: validDay(due) ? due : null,
    assignee_id: orNull(s(fd, "assignee_id")),
    project_id: orNull(s(fd, "project_id")),
    customer_id: orNull(s(fd, "customer_id")),
    service_request_id: orNull(s(fd, "service_request_id")),
  };
}

export async function createTaskAction(fd: FormData) {
  const user = await requireMember();
  const input = formInput(fd);
  const returnTo = s(fd, "return_to") || "/tasks";
  if (!input.title) back(returnTo.includes("new=1") ? returnTo : "/tasks?new=1", "A title is required.", "error");
  const repo = await getRepo();
  const task = await repo.createTask(input);
  scheduleTaskAssigneeEmail({
    task,
    actor: { id: user.id, name: user.name },
    assigneeEmail: await assigneeEmail(repo, task.assignee_id),
  });
  refresh(task.id);
  back(`/tasks/${task.id}`, "Task created.");
}

export async function updateTaskAction(id: string, fd: FormData) {
  const user = await requireMember();
  const repo = await getRepo();
  const existing = await repo.getTask(id);
  if (!existing) back("/tasks", "That task was not found.", "error");
  if (!canEditTask(user)) back(`/tasks/${id}`, "You can only update the status on this task.", "error");
  const input = formInput(fd);
  if (!input.title) back(`/tasks/${id}?edit=1`, "A title is required.", "error");
  const patch: TaskPatch = input;
  await repo.updateTask(id, patch);
  const updated = await repo.getTask(id);
  if (updated) {
    scheduleTaskAssigneeEmail({
      task: updated,
      actor: { id: user.id, name: user.name },
      assigneeEmail: await assigneeEmail(repo, updated.assignee_id),
      previousAssigneeId: existing.assignee_id,
    });
  }
  refresh(id);
  back(`/tasks/${id}`, "Task updated.");
}

export async function setTaskStatusAction(id: string, statusRaw: string) {
  const user = await requireMember();
  const status = parseTaskStatus(statusRaw);
  if (!status) back(`/tasks/${id}`, "Invalid status.", "error");
  const repo = await getRepo();
  const existing = await repo.getTask(id);
  if (!existing) back("/tasks", "That task was not found.", "error");
  if (!canUpdateTaskStatus(user, existing)) back(`/tasks/${id}`, "You cannot update this task.", "error");
  await repo.updateTask(id, { status });
  refresh(id);
  back(`/tasks/${id}`, status === "done" ? "Task marked done." : status === "in_progress" ? "Task marked in progress." : "Task reopened.");
}

export async function deleteTaskAction(id: string) {
  await requireDeleteAccess();
  if (!id) redirect("/tasks");
  await (await getRepo()).deleteTask(id);
  refresh();
  back("/tasks", "Task deleted.");
}
