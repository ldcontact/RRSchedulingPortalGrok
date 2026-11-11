"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDeleteAccess, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { scheduleTaskNotification } from "@/lib/task-notify";
import { describeTaskChanges, involvedProfileIds, type TaskSnapshot } from "@/lib/task-email";
import { canEditTask, canUpdateTaskStatus, canViewTask, normalizeAssigneeIds, parseTaskPriority, parseTaskStatus } from "@/lib/tasks";
import { validDay } from "@/lib/time";
import type { Task, TaskInput, TaskPatch } from "@/lib/types";

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

function snapshot(t: Pick<Task, "title" | "description" | "status" | "priority" | "due_date" | "assignee_ids">): TaskSnapshot {
  return { title: t.title, description: t.description, status: t.status, priority: t.priority, due_date: t.due_date, assignee_ids: t.assignee_ids ?? [] };
}

async function directory(repo: Awaited<ReturnType<typeof getRepo>>, ids: string[]) {
  const emailsById: Record<string, string | null> = {};
  const namesById: Record<string, string> = {};
  await Promise.all(ids.map(async (id) => {
    const p = await repo.getProfile(id);
    emailsById[id] = p?.email ?? null;
    if (p?.full_name) namesById[id] = p.full_name;
  }));
  return { emailsById, namesById };
}

function notify(
  repo: Awaited<ReturnType<typeof getRepo>>,
  task: Pick<Task, "id" | "title" | "description" | "due_date" | "priority" | "assignee_ids" | "created_by" | "email_message_id">,
  actor: { id: string; name: string },
  emailsById: Record<string, string | null | undefined>,
  extra: { kind: "created" | "updated" | "comment"; changes?: ReturnType<typeof describeTaskChanges>; commentBody?: string | null },
) {
  scheduleTaskNotification({
    task,
    actor,
    emailsById,
    kind: extra.kind,
    changes: extra.changes,
    commentBody: extra.commentBody,
    persistRootMessageId: (messageId) => repo.setTaskEmailMessageId(task.id, messageId),
  });
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
    assignee_ids: normalizeAssigneeIds(fd.getAll("assignees").map(String)),
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
  const { emailsById } = await directory(repo, involvedProfileIds({ assignee_ids: task.assignee_ids, created_by: task.created_by }, user.id));
  notify(repo, task, { id: user.id, name: user.name }, emailsById, { kind: "created" });
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
    const { emailsById, namesById } = await directory(repo, involvedProfileIds(updated, "") );
    const changes = describeTaskChanges(snapshot(existing), snapshot(updated), (pid) => namesById[pid] ?? existing.assignees.find((a) => a.id === pid)?.full_name ?? updated.assignees.find((a) => a.id === pid)?.full_name ?? pid);
    notify(repo, updated, { id: user.id, name: user.name }, emailsById, { kind: "updated", changes });
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
  const updated = await repo.getTask(id);
  if (updated) {
    const { emailsById, namesById } = await directory(repo, involvedProfileIds(updated, ""));
    const changes = describeTaskChanges(snapshot(existing), snapshot(updated), (pid) => namesById[pid] ?? pid);
    notify(repo, updated, { id: user.id, name: user.name }, emailsById, { kind: "updated", changes });
  }
  refresh(id);
  back(`/tasks/${id}`, status === "done" ? "Task marked done." : status === "in_progress" ? "Task marked in progress." : "Task reopened.");
}

export async function addTaskCommentAction(id: string, fd: FormData) {
  const user = await requireMember();
  const body = s(fd, "body").slice(0, 5000);
  const repo = await getRepo();
  const existing = await repo.getTask(id);
  if (!existing) back("/tasks", "That task was not found.", "error");
  if (!canViewTask(user, existing)) back(`/tasks/${id}`, "You cannot comment on this task.", "error");
  if (!body) back(`/tasks/${id}`, "Write a comment first.", "error");
  await repo.addTaskComment(id, body);
  const { emailsById } = await directory(repo, involvedProfileIds(existing, user.id));
  notify(repo, existing, { id: user.id, name: user.name }, emailsById, { kind: "comment", commentBody: body });
  refresh(id);
  back(`/tasks/${id}`, "Comment added.");
}

export async function deleteTaskAction(id: string) {
  await requireDeleteAccess();
  if (!id) redirect("/tasks");
  await (await getRepo()).deleteTask(id);
  refresh();
  back("/tasks", "Task deleted.");
}
