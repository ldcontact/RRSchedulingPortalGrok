import type { Metadata } from "next";
import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { Icon } from "@/components/icons";
import { Banner, PageHeader } from "@/components/ui";
import { AvatarStack } from "@/components/status";
import { Modal } from "@/components/modal";
import { Pager, pageParam } from "@/components/pager";
import { TaskPriorityPill, TaskStatusPill } from "@/components/status";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { fmtDay, todayKey } from "@/lib/time";
import { isTaskOverdue } from "@/lib/tasks";
import { PAGE_SIZE, TASK_STATUS_LABEL, TASK_STATUSES, ticketNo, type TaskDueFilter, type TaskPageFilter, type TaskStatus, type TaskTab, type TaskView } from "@/lib/types";
import { TaskForm, requestLabel } from "./task-form";

export const metadata: Metadata = { title: "Tasks" };

const DUE: { key: TaskDueFilter; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "none", label: "No date" },
];

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireMember();
  const staff = isStaff(user.role);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const tab: TaskTab = staff && str("tab") === "all" ? "all" : "mine";
  const status: TaskPageFilter["status"] = str("status") === "all" ? undefined : TASK_STATUSES.includes(str("status") as TaskStatus) ? (str("status") as TaskStatus) : "active";
  const due = (DUE.map((d) => d.key) as TaskDueFilter[]).find((d) => d === str("due"));
  const assignee = str("assignee") === "me" ? user.id : str("assignee") || undefined;
  const q = str("q");
  const repo = await getRepo();
  const [{ items, total, page, size, counts }, people, projects, customerPage] = await Promise.all([
    repo.pageTasks({ tab, q, status: status ?? "active", assignee: tab === "mine" ? undefined : assignee, due, projectId: str("project_id") || undefined, page: pageParam(sp.page), size: PAGE_SIZE }),
    repo.listAssignable(),
    repo.findProjects({ limit: 25 }),
    repo.pageCustomers({ q: "", page: 1, size: 50, sort: "name" }),
  ]);
  let requests: { id: string; label: string }[] = [];
  if (staff) {
    const sr = await repo.pageServiceRequests({ status: "open", page: 1, size: 25 });
    requests = sr.items.map((r) => ({ id: r.id, label: requestLabel(r.id, r.number, r.summary) }));
  }
  const keep: Record<string, string> = {
    ...(tab === "all" ? { tab: "all" } : {}),
    ...(status && status !== "active" ? { status } : {}),
    ...(due ? { due } : {}),
    ...(str("assignee") ? { assignee: str("assignee") } : {}),
    ...(q ? { q } : {}),
    ...(str("project_id") ? { project_id: str("project_id") } : {}),
  };
  const qs = (extra: Record<string, string> = {}, p = 1) => {
    const u = new URLSearchParams({ ...keep, ...extra, ...(p > 1 ? { page: String(p) } : {}) });
    return u.toString();
  };
  const href = (extra: Record<string, string> = {}, p = 1) => `/tasks${qs(extra, p) ? `?${qs(extra, p)}` : ""}`;
  const showNew = str("new") === "1";
  const filtered = !!(q || due || (tab === "all" && assignee) || (status && status !== "active"));
  const defaults = { assignee_ids: [str("assignee_id") || user.id].filter(Boolean), project_id: str("project_id"), customer_id: str("customer_id") };
  return (
    <>
      <PageHeader title="Tasks"
        sub={tab === "mine" ? "Tasks you are assigned to, earliest due date first." : "Every task the team can see, earliest due date first."}
        actions={<PendingLink href={href({ new: "1" })} scroll={false} className="btn btn-primary" data-testid="new-task"><Icon name="plus" />Add task</PendingLink>} />
      {str("ok") && <div className="mb-3"><Banner tone="ok"><Icon name="check" />{str("ok")}</Banner></div>}
      {str("error") && <div className="mb-3"><Banner tone="error"><Icon name="alert" />{str("error")}</Banner></div>}

      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Task lists">
        <Link href={href({ tab: "" })} scroll={false} role="tab" aria-selected={tab === "mine"}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${tab === "mine" ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink"}`}>
          My tasks<span className={`rounded-full px-1.5 text-[11px] ${tab === "mine" ? "bg-white/20" : "bg-canvas"}`}>{counts.mine}</span>
        </Link>
        {staff && (
          <Link href={href({ tab: "all" })} scroll={false} role="tab" aria-selected={tab === "all"}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${tab === "all" ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink"}`} data-testid="tasks-tab-all">
            All<span className={`rounded-full px-1.5 text-[11px] ${tab === "all" ? "bg-white/20" : "bg-canvas"}`}>{counts.all}</span>
          </Link>
        )}
      </div>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {tab === "all" && <input type="hidden" name="tab" value="all" />}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-line bg-white px-3 sm:basis-auto sm:max-w-sm">
          <Icon name="search" className="size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search tasks…" className="w-full min-w-0 bg-transparent py-2 text-sm outline-none" type="search" aria-label="Search tasks" />
        </div>
        <select name="status" defaultValue={status ?? "active"} className="input w-auto" aria-label="Status">
          <option value="active">Status: Active</option>
          {TASK_STATUSES.map((st) => <option key={st} value={st}>{TASK_STATUS_LABEL[st]}</option>)}
        </select>
        {tab === "all" && (
          <select name="assignee" defaultValue={str("assignee")} className="input w-auto" aria-label="Assignee">
            <option value="">Assignee: Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
        <select name="due" defaultValue={due ?? ""} className="input w-auto" aria-label="Due date">
          <option value="">Due: Any</option>
          {DUE.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <button className="btn">Apply</button>
        {filtered && <Link href={tab === "all" ? "/tasks?tab=all" : "/tasks"} className="btn">Clear</Link>}
      </form>

      <div className="card divide-y divide-line" data-testid="task-list">
        {items.length === 0 && <div className="p-8 text-center text-muted">{filtered ? "No tasks match these filters." : tab === "mine" ? "Nothing assigned to you. Add a task or check All." : "No tasks yet."}</div>}
        {items.map((t) => <TaskRow key={t.id} t={t} />)}
      </div>
      <div className="mt-4"><Pager page={page} size={size} total={total} href={(p) => href({}, p)} label="tasks" /></div>

      {showNew && (
        <Modal title="Add task" sub="Assign teammates. Everyone involved gets an email with a link, in one thread per task." closeHref={href()}>
          <TaskForm people={people} projects={projects} customers={customerPage.items.map((c) => ({ id: c.id, label: c.name }))} requests={requests} returnTo={href()} defaults={defaults} />
        </Modal>
      )}
    </>
  );
}

function TaskRow({ t }: { t: TaskView }) {
  const overdue = isTaskOverdue(t, todayKey());
  return (
    <Link href={`/tasks/${t.id}`} className={`flex min-w-0 items-start gap-3 px-4 py-3 hover:bg-[#fafbf9] ${overdue ? "bg-red-50/70" : ""}`} data-testid={`task-row-${t.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate font-semibold">{t.title}</span>
          <TaskStatusPill status={t.status} />
          <TaskPriorityPill priority={t.priority} />
          {overdue && <span className="pill bg-red-100 text-red-800">Overdue</span>}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
          <span className={overdue ? "font-semibold text-red-800" : ""}>{t.due_date ? `Due ${fmtDay(t.due_date)}` : "No due date"}</span>
          {t.customer_name && <span className="truncate">· {t.customer_name}</span>}
          {t.project_name && <span className="truncate">· {t.project_name}</span>}
          {t.service_request_number != null && <span className="truncate">· {ticketNo(t.service_request_number)}</span>}
        </div>
      </div>
      <span className="shrink-0" data-testid={`task-assignees-${t.id}`}><AvatarStack people={t.assignees} max={3} /></span>
    </Link>
  );
}
