import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { AvatarStack } from "@/components/status";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { TaskPriorityPill, TaskStatusPill } from "@/components/status";
import { isStaff, requireMember } from "@/lib/auth";
import { hasDeleteAccess } from "@/lib/delete-access";
import { getRepo } from "@/lib/data/repo";
import { fmtDateTime, fmtDay, todayKey } from "@/lib/time";
import { canEditTask, canUpdateTaskStatus, isTaskOverdue } from "@/lib/tasks";
import { ticketNo } from "@/lib/types";
import { addTaskCommentAction, deleteTaskAction, setTaskStatusAction } from "../actions";
import { TaskForm, requestLabel } from "../task-form";

export const metadata: Metadata = { title: "Task" };

export default async function TaskDetailPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const repo = await getRepo();
  const task = await repo.getTask(id);
  if (!task) notFound();
  const comments = await repo.listTaskComments(id);
  const staff = isStaff(user.role);
  const canEdit = canEditTask(user);
  const canStatus = canUpdateTaskStatus(user, task);
  const canDelete = hasDeleteAccess(user);
  const overdue = isTaskOverdue(task, todayKey());
  const showEdit = str("edit") === "1" && canEdit;
  const showDelete = str("delete") === "1" && canDelete;

  const formLists = { people: [] as Awaited<ReturnType<typeof repo.listAssignable>>, projects: [] as Awaited<ReturnType<typeof repo.findProjects>>, customers: [] as { id: string; label: string }[], requests: [] as { id: string; label: string }[] };
  if (showEdit) {
    const [people, projects, customerPage] = await Promise.all([
      repo.listAssignable(),
      repo.findProjects({ limit: 25 }),
      repo.pageCustomers({ q: "", page: 1, size: 50, sort: "name" }),
    ]);
    formLists.people = people;
    formLists.projects = projects;
    formLists.customers = customerPage.items.map((c) => ({ id: c.id, label: c.name }));
    if (staff) {
      const sr = await repo.pageServiceRequests({ status: "open", page: 1, size: 25 });
      formLists.requests = sr.items.map((r) => ({ id: r.id, label: requestLabel(r.id, r.number, r.summary) }));
      if (task.service_request_id && !formLists.requests.some((r) => r.id === task.service_request_id)) {
        formLists.requests.unshift({ id: task.service_request_id, label: requestLabel(task.service_request_id, task.service_request_number, task.service_request_summary) });
      }
    }
  }

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
          {canEdit && <Link href={`/tasks/${task.id}?edit=1`} scroll={false} className="btn" data-testid="edit-task"><Icon name="edit" />Edit</Link>}
          {canDelete && <Link href={`/tasks/${task.id}?delete=1`} scroll={false} className="btn btn-danger" data-testid="delete-task"><Icon name="trash" />Delete</Link>}
        </>} />
      {str("ok") && <div className="mb-3"><Banner tone="ok"><Icon name="check" />{str("ok")}</Banner></div>}
      {str("error") && <div className="mb-3"><Banner tone="error"><Icon name="alert" />{str("error")}</Banner></div>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Details</h3><TaskPriorityPill priority={task.priority} always /></div>
          <div className="whitespace-pre-wrap p-5 text-sm leading-relaxed">{task.description || <span className="text-muted">No additional details.</span>}</div>
        </div>
        <div className="card min-w-0 p-5 text-sm">
          <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
            <dt className="text-muted">Assignees</dt>
            <dd className="min-w-0" data-testid="task-detail-assignees">{task.assignees.length ? <span className="flex flex-col gap-2"><AvatarStack people={task.assignees} max={6} /><span>{task.assignees.map((p) => p.full_name).join(", ")}</span></span> : "Unassigned"}</dd>
            <dt className="text-muted">Due</dt>
            <dd className={overdue ? "font-semibold text-red-800" : ""}>{task.due_date ? fmtDay(task.due_date, { weekday: "long", month: "short", day: "numeric" }) : "No due date"}</dd>
            <dt className="text-muted">Created by</dt>
            <dd className="min-w-0">{task.creator.full_name}</dd>
            <dt className="text-muted">Created</dt>
            <dd>{fmtDateTime(task.created_at)}</dd>
            {task.completed_at && <><dt className="text-muted">Completed</dt><dd>{fmtDateTime(task.completed_at)}</dd></>}
            {task.customer_id && <><dt className="text-muted">Customer</dt><dd className="min-w-0"><Link href={`/customers/${task.customer_id}`} className="font-semibold text-brand hover:underline">{task.customer_name ?? "Customer"}</Link></dd></>}
            {task.project_id && <><dt className="text-muted">Project</dt><dd className="min-w-0"><Link href={`/projects/${task.project_id}`} className="font-semibold text-brand hover:underline">{task.project_name ?? "Project"}</Link></dd></>}
            {task.service_request_id && <><dt className="text-muted">Ticket</dt><dd className="min-w-0"><Link href={`/service-requests/${task.service_request_id}`} className="font-semibold text-brand hover:underline">{task.service_request_number != null ? ticketNo(task.service_request_number) : "Service request"}{task.service_request_summary ? ` · ${task.service_request_summary}` : ""}</Link></dd></>}
          </dl>
        </div>
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

      {showEdit && (
        <Modal title="Edit task" closeHref={`/tasks/${task.id}`}>
          <TaskForm task={task} people={formLists.people} projects={formLists.projects} customers={formLists.customers} requests={formLists.requests} returnTo={`/tasks/${task.id}`} />
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
