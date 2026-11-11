import { TASK_PRIORITY_LABEL, type TaskPriority } from "@/lib/types";
import { fmtDay, validDay } from "@/lib/time";

/** Production app origin used in notification links, even when sent from a preview. */
export const TASK_EMAIL_BASE = "https://rr-scheduling-portal-grokv1.vercel.app";

export function taskUrl(id: string, base = TASK_EMAIL_BASE): string {
  return `${base.replace(/\/$/, "")}/tasks/${id}`;
}

export function taskEmailSubject(title: string): string {
  const t = title.trim() || "Untitled task";
  return `New task: ${t}`;
}

export function formatTaskDue(due: string | null): string {
  if (!due || !validDay(due)) return "No due date";
  return fmtDay(due, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export type TaskEmailInput = {
  id: string;
  title: string;
  description?: string | null;
  due_date: string | null;
  priority: TaskPriority;
  assignerName: string;
};

export function taskEmailText(input: TaskEmailInput): string {
  const link = taskUrl(input.id);
  const lines = [
    `${input.assignerName} assigned you a task in RR Scheduler.`,
    "",
    `Title: ${input.title.trim() || "Untitled task"}`,
    `Due: ${formatTaskDue(input.due_date)}`,
    `Priority: ${TASK_PRIORITY_LABEL[input.priority]}`,
    `Assigned by: ${input.assignerName}`,
  ];
  if (input.description?.trim()) {
    lines.push("", input.description.trim());
  }
  lines.push("", `Open the task: ${link}`);
  return lines.join("\n");
}

export function taskEmailHtml(input: TaskEmailInput): string {
  const link = taskUrl(input.id);
  const title = escapeHtml(input.title.trim() || "Untitled task");
  const assigner = escapeHtml(input.assignerName);
  const desc = input.description?.trim()
    ? `<p style="margin:16px 0 0;white-space:pre-wrap;color:#334155">${escapeHtml(input.description.trim())}</p>`
    : "";
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c2423">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#134e4a;color:#fff;padding:16px 20px;font-weight:700;font-size:15px">RR Scheduler</div>
    <div style="padding:20px">
      <p style="margin:0 0 16px;font-size:14px;color:#475569">${assigner} assigned you a task.</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${title}</h1>
      <table style="border-collapse:collapse;font-size:14px;width:100%">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">Due</td><td style="padding:4px 0;font-weight:600">${escapeHtml(formatTaskDue(input.due_date))}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Priority</td><td style="padding:4px 0;font-weight:600">${TASK_PRIORITY_LABEL[input.priority]}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Assigned by</td><td style="padding:4px 0;font-weight:600">${assigner}</td></tr>
      </table>
      ${desc}
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function shouldEmailAssignee(opts: { assigneeId: string | null | undefined; actorId: string; previousAssigneeId?: string | null }): boolean {
  if (!opts.assigneeId) return false;
  if (opts.assigneeId === opts.actorId) return false;
  if (opts.previousAssigneeId !== undefined && opts.assigneeId === opts.previousAssigneeId) return false;
  return true;
}
