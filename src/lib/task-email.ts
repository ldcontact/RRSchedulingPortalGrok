import { randomUUID } from "node:crypto";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type TaskPriority, type TaskStatus } from "@/lib/types";
import { fmtDay, validDay } from "@/lib/time";
import { normalizeAssigneeIds } from "@/lib/tasks";

/** Production app origin used in notification links, even when sent from a preview. */
export const TASK_EMAIL_BASE = "https://rr-scheduling-portal-grokv1.vercel.app";
export const TASK_MAIL_DOMAIN = "rr-scheduling-portal-grokv1.vercel.app";

export function taskUrl(id: string, base = TASK_EMAIL_BASE): string {
  return `${base.replace(/\/$/, "")}/tasks/${id}`;
}

/** Shared subject for every email in a task's thread so Gmail groups them. */
export function taskEmailSubject(title: string): string {
  const t = title.trim() || "Untitled task";
  return `Task: ${t}`;
}

export function formatTaskDue(due: string | null): string {
  if (!due || !validDay(due)) return "No due date";
  return fmtDay(due, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function newTaskMessageId(taskId: string): string {
  const token = randomUUID().replace(/-/g, "").slice(0, 16);
  return `<task.${taskId}.${token}@${TASK_MAIL_DOMAIN}>`;
}

export function normalizeMessageId(id: string | null | undefined): string {
  const t = (id ?? "").trim();
  if (!t) return "";
  return t.startsWith("<") ? t : `<${t}>`;
}

export function uniqueMessageId(taskId: string): string {
  return newTaskMessageId(taskId);
}

/** Assignees + creator, excluding the person who made the change. */
export function involvedProfileIds(task: { assignee_ids: string[]; created_by: string }, actorId: string): string[] {
  return [...new Set([task.created_by, ...normalizeAssigneeIds(task.assignee_ids)])].filter((id) => id && id !== actorId);
}

export function shouldEmailAssignee(opts: { assigneeId: string | null | undefined; actorId: string; previousAssigneeIds?: string[] | null }): boolean {
  if (!opts.assigneeId) return false;
  if (opts.assigneeId === opts.actorId) return false;
  if (opts.previousAssigneeIds && opts.previousAssigneeIds.includes(opts.assigneeId)) return false;
  return true;
}

/** Assignees who were newly added, and not the person making the change. */
export function addedAssigneeIds(next: string[], previous: string[] | undefined, actorId: string): string[] {
  const prev = new Set(previous ?? []);
  return [...new Set(next.filter(Boolean))].filter((id) => id !== actorId && !prev.has(id));
}

export type TaskSnapshot = {
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_ids: string[];
};

export type TaskChange = { field: string; label: string; from: string; to: string };

export function describeTaskChanges(prev: TaskSnapshot, next: TaskSnapshot, nameOf: (id: string) => string = (id) => id): TaskChange[] {
  const changes: TaskChange[] = [];
  const push = (field: string, label: string, from: string, to: string) => {
    if (from !== to) changes.push({ field, label, from, to });
  };
  push("title", "Title", prev.title.trim() || "Untitled task", next.title.trim() || "Untitled task");
  push("description", "Details", (prev.description ?? "").trim() || "(none)", (next.description ?? "").trim() || "(none)");
  push("status", "Status", TASK_STATUS_LABEL[prev.status], TASK_STATUS_LABEL[next.status]);
  push("priority", "Priority", TASK_PRIORITY_LABEL[prev.priority], TASK_PRIORITY_LABEL[next.priority]);
  push("due_date", "Due date", formatTaskDue(prev.due_date), formatTaskDue(next.due_date));
  const prevIds = normalizeAssigneeIds(prev.assignee_ids);
  const nextIds = normalizeAssigneeIds(next.assignee_ids);
  const same = prevIds.length === nextIds.length && prevIds.every((id) => nextIds.includes(id));
  if (!same) {
    const names = (ids: string[]) => (ids.length ? ids.map(nameOf).join(", ") : "Unassigned");
    push("assignees", "Assignees", names(prevIds), names(nextIds));
  }
  return changes;
}

export type TaskNoticeKind = "created" | "updated" | "comment";

export type TaskEmailInput = {
  id: string;
  title: string;
  description?: string | null;
  due_date: string | null;
  priority: TaskPriority;
  actorName: string;
  kind?: TaskNoticeKind;
  changes?: TaskChange[];
  commentBody?: string | null;
  /** @deprecated use actorName */
  assignerName?: string;
};

function actorOf(input: TaskEmailInput): string {
  return (input.actorName || input.assignerName || "A teammate").trim() || "A teammate";
}

function introOf(input: TaskEmailInput): string {
  const who = actorOf(input);
  if (input.kind === "updated") return `${who} updated a task in RR Scheduler.`;
  if (input.kind === "comment") return `${who} commented on a task in RR Scheduler.`;
  return `${who} assigned you a task in RR Scheduler.`;
}

export function taskEmailText(input: TaskEmailInput): string {
  const link = taskUrl(input.id);
  const lines = [
    introOf(input),
    "",
    `Title: ${input.title.trim() || "Untitled task"}`,
    `Due: ${formatTaskDue(input.due_date)}`,
    `Priority: ${TASK_PRIORITY_LABEL[input.priority]}`,
  ];
  if (input.kind === "updated" && input.changes?.length) {
    lines.push("", "What changed:");
    for (const c of input.changes) lines.push(`- ${c.label}: ${c.from} → ${c.to}`);
  }
  if (input.kind === "comment" && input.commentBody?.trim()) {
    lines.push("", "Comment:", input.commentBody.trim());
  } else if (input.kind !== "updated" && input.kind !== "comment" && input.description?.trim()) {
    lines.push("", input.description.trim());
  }
  lines.push("", `Open the task: ${link}`);
  return lines.join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function taskEmailHtml(input: TaskEmailInput): string {
  const link = taskUrl(input.id);
  const title = escapeHtml(input.title.trim() || "Untitled task");
  const actor = escapeHtml(actorOf(input));
  const intro = escapeHtml(introOf(input));
  let extra = "";
  if (input.kind === "updated" && input.changes?.length) {
    const rows = input.changes.map((c) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap">${escapeHtml(c.label)}</td><td style="padding:6px 0">${escapeHtml(c.from)} → <strong>${escapeHtml(c.to)}</strong></td></tr>`
    ).join("");
    extra = `<h2 style="margin:20px 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#64748b">What changed</h2><table style="border-collapse:collapse;font-size:14px;width:100%">${rows}</table>`;
  } else if (input.kind === "comment" && input.commentBody?.trim()) {
    extra = `<div style="margin:16px 0 0;padding:12px 14px;background:#f4f6f5;border-radius:8px;white-space:pre-wrap;color:#1c2423">${escapeHtml(input.commentBody.trim())}</div>`;
  } else if (input.description?.trim()) {
    extra = `<p style="margin:16px 0 0;white-space:pre-wrap;color:#334155">${escapeHtml(input.description.trim())}</p>`;
  }
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c2423">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#134e4a;color:#fff;padding:16px 20px;font-weight:700;font-size:15px">RR Scheduler</div>
    <div style="padding:20px">
      <p style="margin:0 0 16px;font-size:14px;color:#475569">${intro}</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${title}</h1>
      <table style="border-collapse:collapse;font-size:14px;width:100%">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">Due</td><td style="padding:4px 0;font-weight:600">${escapeHtml(formatTaskDue(input.due_date))}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Priority</td><td style="padding:4px 0;font-weight:600">${TASK_PRIORITY_LABEL[input.priority]}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">${input.kind === "comment" ? "Commented by" : input.kind === "updated" ? "Updated by" : "Assigned by"}</td><td style="padding:4px 0;font-weight:600">${actor}</td></tr>
      </table>
      ${extra}
      <p style="margin:24px 0 0">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px">Open task</a>
      </p>
      <p style="margin:12px 0 0;font-size:12px;color:#64748b">${escapeHtml(link)}</p>
    </div>
  </div>
</body></html>`;
}

export function buildTaskEmail(input: TaskEmailInput): { subject: string; text: string; html: string; url: string } {
  return { subject: taskEmailSubject(input.title), text: taskEmailText(input), html: taskEmailHtml(input), url: taskUrl(input.id) };
}

export function threadingHeaders(opts: { rootMessageId: string; isRoot: boolean; taskId: string }): { messageId: string; inReplyTo?: string; references?: string } {
  const root = normalizeMessageId(opts.rootMessageId);
  if (opts.isRoot) return { messageId: root };
  return { messageId: uniqueMessageId(opts.taskId), inReplyTo: root, references: root };
}
