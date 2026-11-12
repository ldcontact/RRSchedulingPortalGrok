"use client";
import Link from "next/link";
import { useActionState } from "react";
import { CustomerPicker, type CustomerHit } from "@/components/customer-picker";
import { SubmitButton } from "@/components/submit-button";
import { saveProject } from "./actions";
import { ProjectTypePicker } from "@/components/project-type-picker";
import { ProjectFilePicker } from "@/components/project-files";
import { DEFAULT_WARRANTY_MONTHS, PROJECT_STATUSES, PROJECT_STATUS_LABEL, type Project } from "@/lib/types";

export function ProjectForm({ project, initialCustomer, customerId }: { project?: Project; initialCustomer?: CustomerHit | null; customerId?: string }) {
  const [state, action] = useActionState(saveProject, undefined);
  const v = (k: string, fallback = "") => state?.values?.[k] ?? (project ? String((project as Record<string, unknown>)[k] ?? "") : fallback);
  return (
    <form action={action} className="card grid min-w-0 w-full gap-4 p-5 sm:grid-cols-2">
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="label sm:col-span-2">Customer *
        <CustomerPicker
          name="customer_id"
          required
          defaultSelected={initialCustomer ?? null}
          defaultSelectedId={initialCustomer ? undefined : (customerId || project?.customer_id)}
        />
      </div>
      <label className="label sm:col-span-2">Project name *<input className="input" name="name" required defaultValue={v("name")} placeholder="e.g. LED retrofit – warehouse" /></label>
      <label className="label min-w-0">Type
        <ProjectTypePicker name="type" defaultValue={v("type", "lighting")} />
      </label>
      <label className="label">Status
        <select className="input" name="status" defaultValue={v("status", "proposed")}>
          {PROJECT_STATUSES.map((t) => <option key={t} value={t}>{PROJECT_STATUS_LABEL[t]}</option>)}
        </select>
        <span className="font-normal text-muted">Updates automatically as visits are scheduled, started and approved.</span>
      </label>
      <label className="label">Project value ($)<input className="input" name="value" inputMode="decimal" defaultValue={v("value", "0")} /></label>
      <label className="label">Estimated rebate ($)<input className="input" name="est_rebate" inputMode="decimal" defaultValue={v("est_rebate", "0")} /></label>
      <label className="label">Warranty (months)<input className="input" name="warranty_months" type="number" min={0} max={600} step={1} inputMode="numeric" defaultValue={v("warranty_months", String(DEFAULT_WARRANTY_MONTHS))} />
        <span className="font-normal text-muted">Counted from completion. Used to check service requests (default {DEFAULT_WARRANTY_MONTHS} = 1 year).</span>
      </label>
      <label className="label sm:col-span-2">Scope of work
        <textarea className="input min-h-40 font-normal" name="scope" defaultValue={v("scope")} placeholder={"Fixture counts, wattages, rooms, access notes…\nTechs on this project will see this."} />
      </label>
      {!project && (
        <div className="label min-w-0 sm:col-span-2">Attachments
          <span className="font-normal text-muted">(optional) — PDFs, Excel, and images the crew should review before they start.</span>
          <ProjectFilePicker />
        </div>
      )}
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href={project ? `/projects/${project.id}` : "/projects"} className="btn">Cancel</Link>
        <SubmitButton className="btn btn-primary">{project ? "Save changes" : "Create project"}</SubmitButton>
      </div>
    </form>
  );
}
