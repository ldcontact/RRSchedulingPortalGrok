"use client";

import { useState } from "react";
import { CustomerPicker } from "@/components/customer-picker";
import { ProjectPicker } from "@/components/project-picker";
import { SubmitButton } from "@/components/submit-button";
import { Avatar } from "@/components/ui";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type Person, type TaskView } from "@/lib/types";
import { createTaskAction, updateTaskAction } from "./actions";

export type TaskFormOption = { id: string; label: string };

export function TaskForm({
  task,
  people,
  requests,
  returnTo,
  defaults,
}: {
  task?: TaskView;
  people: (Person & { role?: string })[];
  requests: TaskFormOption[];
  returnTo: string;
  defaults?: { assignee_ids?: string[]; project_id?: string; customer_id?: string; service_request_id?: string };
}) {
  const action = task ? updateTaskAction.bind(null, task.id) : createTaskAction;
  const initialCustomerId = task?.customer_id ?? defaults?.customer_id ?? "";
  const [customerId, setCustomerId] = useState(initialCustomerId);
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
      <fieldset className="block">
        <legend className="mb-1 text-[12.5px] font-semibold">Assignees</legend>
        <p className="mb-2 text-xs text-muted">Select everyone who should work this task. Assignees and the creator get an email when something changes, except the person who made the change.</p>
        <div className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded-lg border border-line p-1.5" data-testid="task-assignees">
          {people.map((p) => {
            const checked = (task?.assignee_ids ?? defaults?.assignee_ids ?? []).includes(p.id);
            return (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-canvas has-[:checked]:bg-brand-50">
                <input type="checkbox" name="assignees" value={p.id} defaultChecked={checked} className="accent-brand" />
                <Avatar name={p.full_name} color={p.color} size="sm" src={p.avatar_url} />
                <span className="min-w-0 truncate font-medium">{p.full_name}</span>
              </label>
            );
          })}
          {people.length === 0 && <div className="px-2 py-1.5 text-sm text-muted">No teammates to assign.</div>}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <div className="block sm:col-span-2">
          <span className="mb-1 block text-[12.5px] font-semibold">Customer <span className="font-normal text-muted">(optional)</span></span>
          <CustomerPicker
            name="customer_id"
            defaultSelected={task?.customer_id ? { id: task.customer_id, name: task.customer_name ?? "Customer", address: "" } : null}
            defaultSelectedId={!task?.customer_id ? defaults?.customer_id : undefined}
            onChange={(c) => setCustomerId(c?.id ?? "")}
          />
        </div>
        <div className="block sm:col-span-2">
          <span className="mb-1 block text-[12.5px] font-semibold">Project <span className="font-normal text-muted">(optional)</span></span>
          <ProjectPicker
            name="project_id"
            customerId={customerId || undefined}
            defaultSelected={task?.project_id ? { id: task.project_id, name: task.project_name ?? "Project", customer_name: task.customer_name ?? "", status: "proposed" } : null}
            defaultSelectedId={!task?.project_id ? defaults?.project_id : undefined}
          />
        </div>
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

