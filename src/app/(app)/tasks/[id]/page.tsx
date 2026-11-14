import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { TaskDescription } from "@/components/task-description";
import { TaskPriorityPill, TaskStatusPill } from "@/components/status";
import { isStaff, requireMember } from "@/lib/auth";
import { hasDeleteAccess } from "@/lib/delete-access";
import { getRepo } from "@/lib/data/repo";
import { fmtDateTime, fmtDay, todayKey } from "@/lib/time";
import { canEditTask, canUpdateTaskStatus, isTaskOverdue } from "@/lib/tasks";
import { ticketNo } from "@/lib/types";
import { addTaskCommentAction, deleteTaskAction, setTaskStatusAction } from "../actions";
import { settle } from "../settle";
import { requestLabel } from "../request-label";
import { TaskForm } from "../task-form";

export const metadata: Metadata = { title: "Task" };

export default async function TaskDetailPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const repo = await getRepo();
  const taskResult = await settle("getTask", repo.getTask(id), null);
  const task = taskResult.value;
  if (!taskResult.ok) {
    return (
      <>
        <PageHeader back={{ href: "/tasks", label: "Tasks" }} title="Task" />
        <Banner tone="error"><Icon name="alert" />This task could not load just now. Try again in a moment.</Banner>
      </>
    );
  }
  if (!task) notFound();
  const comments = (await settle("listTaskComments", repo.listTaskComments(id), [])).value;
  const staff = isStaff(user.role);
  const canEdit = canEditTask(user);
  const canStatus = canUpdateTaskStatus(user, task);
  const canDelete = hasDeleteAccess(user);
  const overdue = isTaskOverdue(task, todayKey());
  const showEdit = str("edit") === "1" && canEdit;
  const showDelete = str("delete") === "1" && canDelete;

  const formLists = { people: [] as Awaited<ReturnType<typeof repo.listAssignable>>, requests: [] as { id: string; label: string }[] };
  if (showEdit) {
    formLists.people = (await settle("listAssignable", repo.listAssignable(), [])).value;
    if (staff) {
      const sr = (await settle("listOpenServiceRequestPicks", repo.listOpenServiceRequestPicks(25), [])).value;
      formLists.requests = sr.map((r) => ({ id: r.id, label: requestLabel(r.id, r.number, r.summary) }));
      if (task.service_request_id && !formLists.requests.some((r) => r.id === task.service_request_id)) {
        formLists.requests.unshift({ id: task.service_request_id, label: requestLabel(task.service_request_id, task.service_request_number, task.service_request_summary) });
      }
    }
  }

  const links = (
    [
      task.customer_id ? { href: `/customers/${task.customer_id}`, label: task.customer_name ?? "Customer", kind: "Customer" } : null,
      task.project_id ? { href: `/projects/${task.project_id}`, label: task.project_name ?? "Project", kind: "Project" } : null,
      task.service_request_id ? {
        href: `/service-requests/${task.service_request_id}`,
        label: `${task.service_request_number != null ? ticketNo(task.service_request_number) : "Service request"}${task.service_request_summary ? ` · ${task.service_request_summary}` : ""}`,
        kind: "Ticket",
      } : null,
    ] as const
  ).filter((x): x is { href: string; label: string; kind: string } => !!x);

  return (
    <>
      <PageHeader back={{ href: "/tasks", label: "Tasks" }}
        title={<span className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0">{task.title}</span><TaskStatusPill status={task.status} />{overdue && <span className="pill bg-red-100 text-red-800">Overdue</span>}</span>}
        sub={task.due_date ? <span className={overdue ? "font-semibold text-red-800" : ""}>Due {fmtDay(task.due_date)}</span> : "No due date"}
        actions={<>
          {canStatus && task.status !== "in_progress" && task.status !== "done" && (
            <form action={setTaskStatusAction.bind(null, task.id, "in_progress")}><SubmitButton className="btn">Start</SubmitButton></form>
          )}
          {canStatus && task.status !== "done" && (
            <form action={setTaskStatusAction.bind(null, task.id, "done")}><SubmitButton className="btn btn-primary"><Icon name="check" />Mark done</SubmitButton></form>
          )}
          {canStatus && task.status === "done" && (
            <form action={setTaskStatusAction.bind(null, task.id, "open")}><SubmitButton className="btn"><Icon name="undo" />Reopen</SubmitButton></form>
          )}
          {canEdit && <PendingLink href={`/tasks/${task.id}?edit=1`} scroll={false} className="btn" data-testid="edit-task"><Icon name="edit" />Edit</PendingLink>}
          {canDelete && <Link href={`/tasks/${task.id}?delete=1`} scroll={false} className="btn btn-danger" data-testid="delete-task"><Icon name="trash" />Delete</Link>}
        </>} />
      {str("ok") && <div className="mb-3"><Banner tone="ok"><Icon name="check" />{str("ok")}</Banner></div>}
      {str("error") && <div className="mb-3"><Banner tone="error"><Icon name="alert" />{str("error")}</Banner></div>}

      <div className="mx-auto w-full max-w-[980px]">
        <div className={`card mb-4 grid grid-cols-2 overflow-hidden ${task.completed_at ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
          <MetaCell label="Status" className="border-r border-b md:border-b-0"><TaskStatusPill status={task.status} /></MetaCell>
          <MetaCell label="Priority" className="border-b md:border-r md:border-b-0">
            <TaskPriorityPill priority={task.priority} always />
          </MetaCell>
          <MetaCell label="Due" className="border-r border-b md:border-b-0">
            <div className={`text-sm font-semibold ${overdue ? "text-red-800" : ""}`}>
              {task.due_date ? fmtDay(task.due_date, { weekday: "long", month: "short", day: "numeric" }) : "No due date"}
            </div>
          </MetaCell>
          <MetaCell label="Created" className={task.completed_at ? "border-b md:border-r md:border-b-0" : ""}>
            <div className="text-sm font-semibold">{task.creator.full_name}</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-muted">{fmtDateTime(task.created_at)}</div>
          </MetaCell>
          {task.completed_at && (
            <MetaCell label="Completed" className="max-md:col-span-2">
              <div className="text-sm font-semibold">{fmtDateTime(task.completed_at)}</div>
            </MetaCell>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="task-detail-assignees">
          {task.assignees.length ? task.assignees.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-[13.5px] font-semibold">
              <Avatar name={p.full_name} color={p.color} size="sm" src={p.avatar_url} />
              {p.full_name}
            </span>
          )) : <span className="text-sm text-muted">Unassigned</span>}
        </div>

        {!!links.length && (
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {links.map((l) => (
              <span key={l.href} className="min-w-0">
                <span className="text-muted">{l.kind}: </span>
                <Link href={l.href} className="font-semibold text-brand hover:underline">{l.label}</Link>
              </span>
            ))}
          </div>
        )}

        <div className="card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Details</h3></div>
          <TaskDescription text={task.description} />
        </div>

        <div className="card mt-4" data-testid="task-comments">
          <div className="card-hd"><h3 className="font-semibold">Comments</h3><span className="text-xs text-muted">{comments.length ? `${comments.length} in the thread` : "Everyone on the task is notified"}</span></div>
          <ol className="divide-y divide-line">
            {comments.map((n) => (
              <li key={n.id} className="flex gap-2.5 px-5 py-3 text-sm">
                <Avatar name={n.author_name} color={n.author_color} size="sm" src={n.author_avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div>
                  <div className="whitespace-pre-wrap">{n.body}</div>
                </div>
              </li>
            ))}
            {!comments.length && <li className="px-5 py-4 text-sm text-muted">No comments yet. Add a note and everyone involved will get an email.</li>}
          </ol>
          <form action={addTaskCommentAction.bind(null, task.id)} className="flex gap-2 border-t border-line p-4">
            <input name="body" required className="input" placeholder="Add a comment…" aria-label="Comment" maxLength={5000} />
            <SubmitButton className="btn btn-primary">Add comment</SubmitButton>
          </form>
        </div>
      </div>

      {showEdit && (
        <Modal title="Edit task" closeHref={`/tasks/${task.id}`}>
          <TaskForm task={task} people={formLists.people} requests={formLists.requests} returnTo={`/tasks/${task.id}`} />
        </Modal>
      )}
      {showDelete && (
        <DeleteConfirmDialog
          title="Delete task"
          itemName={task.title}
          cancelHref={`/tasks/${task.id}`}
          action={deleteTaskAction.bind(null, task.id)}
          consequences={["The task will be removed for everyone.", "This cannot be undone."]}
        />
      )}
    </>
  );
}

function MetaCell({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 border-line px-4 py-3 ${className}`}>
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}
