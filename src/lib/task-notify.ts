import "server-only";
import { after } from "next/server";
import { sendEmail, smtpConfigured, smtpMissingMessage } from "@/lib/email";
import { buildTaskEmail, shouldEmailAssignee, type TaskEmailInput } from "@/lib/task-email";
import type { TaskPriority } from "@/lib/types";

type Notice = {
  task: { id: string; title: string; description?: string | null; due_date: string | null; priority: TaskPriority; assignee_id: string | null };
  actor: { id: string; name: string };
  assigneeEmail: string | null | undefined;
  previousAssigneeId?: string | null;
};

/** Queue a non-blocking assignee email after the response is sent. Never throws to the caller. */
export function scheduleTaskAssigneeEmail(notice: Notice) {
  if (!shouldEmailAssignee({ assigneeId: notice.task.assignee_id, actorId: notice.actor.id, previousAssigneeId: notice.previousAssigneeId })) {
    return;
  }
  after(() => deliverTaskAssigneeEmail(notice));
}

export async function deliverTaskAssigneeEmail(notice: Notice) {
  if (!shouldEmailAssignee({ assigneeId: notice.task.assignee_id, actorId: notice.actor.id, previousAssigneeId: notice.previousAssigneeId })) {
    return;
  }
  if (!smtpConfigured()) {
    console.info("[email] skipped task notification:", smtpMissingMessage());
    return;
  }
  const to = notice.assigneeEmail?.trim();
  if (!to) {
    console.info("[email] skipped task notification: assignee has no email");
    return;
  }
  const input: TaskEmailInput = {
    id: notice.task.id,
    title: notice.task.title,
    description: notice.task.description,
    due_date: notice.task.due_date,
    priority: notice.task.priority,
    assignerName: notice.actor.name,
  };
  const mail = buildTaskEmail(input);
  try {
    await sendEmail({ to, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (err) {
    console.error("[email] task notification failed:", err instanceof Error ? err.message : "unknown error");
  }
}
