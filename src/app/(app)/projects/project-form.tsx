"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveProject } from "./actions";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL, type Project, type ProjectType } from "@/lib/types";

export function ProjectForm({ project, customers, customerId }: { project?: Project; customers: { id: string; name: string }[]; customerId?: string }) {
  const [state, action, pending] = useActionState(saveProject, undefined);
  const v = (k: string, fallback = "") => state?.values?.[k] ?? (project ? String((project as Record<string, unknown>)[k] ?? "") : fallback);
  return (
    <form action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      {project && <input type="hidden" name="id" value={project.id} />}
      <label className="label sm:col-span-2">Customer *
        <select className="input" name="customer_id" required defaultValue={v("customer_id", customerId ?? "")}>
          <option value="" disabled>Choose a customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="label sm:col-span-2">Project name *<input className="input" name="name" required defaultValue={v("name")} placeholder="e.g. LED retrofit – warehouse" /></label>
      <label className="label">Type
        <select className="input" name="type" defaultValue={v("type", "lighting")}>
          {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => <option key={t} value={t}>{PROJECT_TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <label className="label">Status
        <select className="input" name="status" defaultValue={v("status", "proposed")}>
          {PROJECT_STATUSES.map((t) => <option key={t} value={t}>{PROJECT_STATUS_LABEL[t]}</option>)}
        </select>
        <span className="font-normal text-muted">Updates automatically as visits are scheduled, started and approved.</span>
      </label>
      <label className="label">Project value ($)<input className="input" name="value" inputMode="decimal" defaultValue={v("value", "0")} /></label>
      <label className="label">Estimated rebate ($)<input className="input" name="est_rebate" inputMode="decimal" defaultValue={v("est_rebate", "0")} /></label>
      <label className="label">Warranty (months)<input className="input" name="warranty_months" type="number" min={0} max={600} step={1} inputMode="numeric" defaultValue={v("warranty_months", "24")} />
        <span className="font-normal text-muted">Counted from completion. Used to check service requests (default 24 = 2 years).</span>
      </label>
      <label className="label sm:col-span-2">Scope of work
        <textarea className="input min-h-40 font-normal" name="scope" defaultValue={v("scope")} placeholder={"Fixture counts, wattages, rooms, access notes…\nTechs on this project will see this."} />
      </label>
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href={project ? `/projects/${project.id}` : "/projects"} className="btn">Cancel</Link>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</button>
      </div>
    </form>
  );
}
