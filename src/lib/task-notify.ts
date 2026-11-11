import "server-only";
import { after } from "next/server";
import { sendEmail, emailConfigured, emailMissingMessage } from "@/lib/email";
import {
  buildTaskEmail,
  involvedProfileIds,
  newTaskMessageId,
  normalizeMessageId,
  threadingHeaders,
  type TaskChange,
  type TaskNoticeKind,
} from "@/lib/task-email";
import type { TaskPriority } from "@/lib/types";

export type TaskNotice = {
  task: {
    id: string;
    title: string;
    description?: string | null;
    due_date: string | null;
    priority: TaskPriority;
    assignee_ids: string[];
    created_by: string;
    email_message_id?: string | null;
  };
  actor: { id: string; name: string };
  emailsById: Record<string, string | null | undefined>;
  kind: TaskNoticeKind;
  changes?: TaskChange[];
  commentBody?: string | null;
  /** Persist the root Message-ID after it is minted (first email in the thread). */
  persistRootMessageId?: (messageId: string) => Promise<void>;
};

/** Queue a non-blocking email to everyone involved except the actor. Never throws to the caller. */
export function scheduleTaskNotification(notice: TaskNotice) {
  const ids = involvedProfileIds(notice.task, notice.actor.id);
  if (!ids.length) return;
  if (notice.kind === "updated" && !notice.changes?.length) return;
  if (notice.kind === "comment" && !notice.commentBody?.trim()) return;
  after(() => deliverTaskNotification(notice, ids));
}

export async function deliverTaskNotification(notice: TaskNotice, ids?: string[]) {
  const targets = ids ?? involvedProfileIds(notice.task, notice.actor.id);
  if (!targets.length) return;
  if (!emailConfigured()) {
    console.info("[email] skipped task notification:", emailMissingMessage());
    return;
  }
  const mail = buildTaskEmail({
    id: notice.task.id,
    title: notice.task.title,
    description: notice.task.description,
    due_date: notice.task.due_date,
    priority: notice.task.priority,
    actorName: notice.actor.name,
    kind: notice.kind,
    changes: notice.changes,
    commentBody: notice.commentBody,
  });
  let root = normalizeMessageId(notice.task.email_message_id);
  let mintedRoot = false;
  if (!root) {
    root = newTaskMessageId(notice.task.id);
    mintedRoot = true;
    if (notice.persistRootMessageId) {
      try { await notice.persistRootMessageId(root); }
      catch (err) { console.error("[email] failed to store task thread id:", err instanceof Error ? err.message : "unknown error"); }
    }
  }
  let first = mintedRoot;
  for (const id of targets) {
    const to = notice.emailsById[id]?.trim();
    if (!to) {
      console.info("[email] skipped task notification: teammate has no email");
      continue;
    }
    const headers = threadingHeaders({ rootMessageId: root, isRoot: first, taskId: notice.task.id });
    first = false;
    try {
      await sendEmail({ to, subject: mail.subject, text: mail.text, html: mail.html, ...headers });
    } catch (err) {
      console.error("[email] task notification failed:", err instanceof Error ? err.message : "unknown error");
    }
  }
}

/** @deprecated use scheduleTaskNotification */
export const scheduleTaskAssigneeEmail = (notice: Omit<TaskNotice, "kind"> & { kind?: TaskNoticeKind; previousAssigneeIds?: string[] }) => {
  scheduleTaskNotification({ ...notice, kind: notice.kind ?? (notice.previousAssigneeIds ? "updated" : "created") });
};
