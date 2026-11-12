"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveJob } from "./actions";
import { ROLE_LABEL, type Person, type ProjectHit, type Role } from "@/lib/types";
import { ProjectPicker } from "@/components/project-picker";

export type JobFormDefaults = { id?: string; project_id: string; title: string; date: string; start: string; end: string; assignees: string[]; instructions: string };

export function JobForm({ d, selected, customerId, people, cancelHref }: { d: JobFormDefaults; selected?: ProjectHit | null; customerId?: string; people: (Person & { role: string })[]; cancelHref: string }) {
  const [state, action] = useActionState(saveJob, undefined);
  const v = (k: keyof JobFormDefaults) => state?.values?.[k] ?? String(d[k] ?? "");
  const chosen = new Set(state?.values ? state.values.assignees.split(",").filter(Boolean) : d.assignees);
  const preselected = selected && selected.id === v("project_id") ? selected : null;
  return (
    <form action={action} className="card grid min-w-0 w-full gap-4 p-5 sm:grid-cols-2" key={state?.conflicts ? "c" : "n"}>
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <label className="label min-w-0 sm:col-span-2">Project *
        <ProjectPicker name="project_id" required defaultSelected={preselected} defaultSelectedId={!preselected && v("project_id") ? v("project_id") : undefined} customerId={customerId} />
      </label>
      <label className="label min-w-0 sm:col-span-2">Visit title *<input className="input" name="title" required defaultValue={v("title")} placeholder="e.g. Install – warehouse high bays (day 1)" /></label>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-[1.4fr_1fr_1fr]">
        <label className="label col-span-2 min-w-0 sm:col-span-1">Date<input className="input" type="date" name="date" required defaultValue={v("date")} /></label>
        <label className="label min-w-0">Start<input className="input" type="time" name="start" step={900} required defaultValue={v("start")} /></label>
        <label className="label min-w-0">End<input className="input" type="time" name="end" step={900} required defaultValue={v("end")} /></label>
      </div>
      <fieldset className="min-w-0 sm:col-span-2">
        <legend className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">Crew (one or more)</legend>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <label key={p.id} className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-50">
              <input type="checkbox" name="assignees" value={p.id} defaultChecked={chosen.has(p.id)} className="size-4 shrink-0 accent-[var(--color-brand)]" />
              <Avatar name={p.full_name} color={p.color} size="sm" src={p.avatar_url} />
              <span className="min-w-0 flex-1 truncate font-medium">{p.full_name}</span>
              <span className="min-w-0 max-w-[45%] shrink truncate text-[11px] text-muted" title={ROLE_LABEL[p.role as Role]}>{ROLE_LABEL[p.role as Role]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="label min-w-0 sm:col-span-2">Instructions for the crew<textarea className="input min-h-20 font-normal" name="instructions" defaultValue={v("instructions")} placeholder="Access, parking, what to bring, who to ask for…" /></label>
      {state?.conflicts && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-accent-50 p-3 text-sm text-[#78350f] sm:col-span-2" data-testid="conflict-warning">
          <div className="flex items-center gap-2 font-semibold"><Icon name="alert" className="size-4" />Double-booking</div>
          <ul className="list-disc pl-5">{state.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          <div><SubmitButton name="force" value="1" className="btn btn-sm btn-accent" pendingText="Saving…">Save anyway</SubmitButton> <span className="text-xs">or change the time or crew above.</span></div>
        </div>
      )}
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</div>}
      <div className="flex min-w-0 flex-wrap justify-end gap-2 sm:col-span-2">
        <Link href={cancelHref} className="btn">Cancel</Link>
        <SubmitButton className="btn btn-primary">{d.id ? "Save changes" : "Schedule visit"}</SubmitButton>
      </div>
    </form>
  );
}
