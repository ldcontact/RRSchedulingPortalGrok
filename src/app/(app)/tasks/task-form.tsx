import { SubmitButton } from "@/components/submit-button";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, ticketNo, type Person, type ProjectPick, type TaskView } from "@/lib/types";
import { createTaskAction, updateTaskAction } from "./actions";

export type TaskFormOption = { id: string; label: string };

export function TaskForm({
  task,
  people,
  projects,
  customers,
  requests,
  returnTo,
  defaults,
}: {
  task?: TaskView;
  people: (Person & { role?: string })[];
  projects: ProjectPick[];
  customers: TaskFormOption[];
  requests: TaskFormOption[];
  returnTo: string;
  defaults?: { assignee_id?: string; project_id?: string; customer_id?: string; service_request_id?: string };
}) {
  const action = task ? updateTaskAction.bind(null, task.id) : createTaskAction;
  return (
    <form action={action} className="flex flex-col gap-3 p-5" data-testid="task-form">
      <input type="hidden" name="return_to" value={returnTo} />
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold">Title</span>
        <input name="title" required defaultValue={task?.title ?? ""} className="input w-full" maxLength={200} placeholder="What needs to be done?" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold">Details <span className="font-normal text-muted">(optional)</span></span>
        <textarea name="description" defaultValue={task?.description ?? ""} rows={4} className="input w-full" maxLength={5000} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Assignee</span>
          <select name="assignee_id" defaultValue={task?.assignee_id ?? defaults?.assignee_id ?? ""} className="input w-full" aria-label="Assignee">
            <option value="">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Due date</span>
          <input type="date" name="due_date" defaultValue={task?.due_date ?? ""} className="input w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Priority</span>
          <select name="priority" defaultValue={task?.priority ?? "normal"} className="input w-full">
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Status</span>
          <select name="status" defaultValue={task?.status ?? "open"} className="input w-full">
            {TASK_STATUSES.map((st) => <option key={st} value={st}>{TASK_STATUS_LABEL[st]}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[12.5px] font-semibold">Customer <span className="font-normal text-muted">(optional)</span></span>
          <select name="customer_id" defaultValue={task?.customer_id ?? defaults?.customer_id ?? ""} className="input w-full">
            <option value="">None</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[12.5px] font-semibold">Project <span className="font-normal text-muted">(optional)</span></span>
          <select name="project_id" defaultValue={task?.project_id ?? defaults?.project_id ?? ""} className="input w-full">
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.customer_name} · {p.name}</option>)}
          </select>
        </label>
        {requests.length > 0 && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12.5px] font-semibold">Service request <span className="font-normal text-muted">(optional)</span></span>
            <select name="service_request_id" defaultValue={task?.service_request_id ?? defaults?.service_request_id ?? ""} className="input w-full">
              <option value="">None</option>
              {requests.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <SubmitButton>{task ? "Save task" : "Create task"}</SubmitButton>
      </div>
    </form>
  );
}

export function requestLabel(id: string, number: number | null, summary: string | null) {
  return `${number != null ? ticketNo(number) : id}${summary ? ` · ${summary}` : ""}`;
}
