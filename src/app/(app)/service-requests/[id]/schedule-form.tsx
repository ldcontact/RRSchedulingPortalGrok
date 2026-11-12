"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { scheduleTicketVisit } from "../actions";
import { ROLE_LABEL, type JobKind, type Person, type Role } from "@/lib/types";

export type ScheduleDefaults = { title: string; kind: JobKind; date: string; start: string; end: string; instructions: string };

export function ScheduleVisitForm({ requestId, d, people, projectName, projectComplete, cancelHref }:
  { requestId: string; d: ScheduleDefaults; people: (Person & { role: string })[]; projectName: string; projectComplete: boolean; cancelHref: string }) {
  const [state, action] = useActionState(scheduleTicketVisit, undefined);
  const v = (k: keyof ScheduleDefaults) => state?.values?.[k] ?? d[k];
  const [kind, setKind] = useState<JobKind>((state?.values?.kind as JobKind) || d.kind);
  const chosen = new Set(state?.values ? state.values.assignees.split(",").filter(Boolean) : []);
  return (
    <form action={action} className="flex flex-col gap-4 p-5" key={state?.conflicts ? "c" : "n"} data-testid="schedule-form">
      <input type="hidden" name="request_id" value={requestId} />
      <label className="label">Visit title<input className="input" name="title" required maxLength={120} defaultValue={v("title")} /></label>
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
        <label className="label">Date<input className="input" type="date" name="date" required defaultValue={v("date")} /></label>
        <label className="label">Start<input className="input" type="time" name="start" step={900} required defaultValue={v("start")} /></label>
        <label className="label">End<input className="input" type="time" name="end" step={900} required defaultValue={v("end")} /></label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">Assign tech</legend>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-50" title={ROLE_LABEL[p.role as Role]}>
              <input type="checkbox" name="assignees" value={p.id} defaultChecked={chosen.has(p.id)} className="sr-only" />
              <Avatar name={p.full_name} color={p.color} size="sm" src={p.avatar_url} /><span className="font-medium">{p.full_name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">Visit type</legend>
        <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
          {([["warranty", "shield", "Warranty"], ["service", "wrench", "Service (billable)"]] as const).map(([k, icon, label]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${kind === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" /><Icon name={icon} className="size-4" />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="label">Notes for the tech<textarea className="input min-h-20 font-normal" name="instructions" defaultValue={v("instructions")} /></label>
      <div className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-3.5 py-3 text-[13px] text-[#134e4a]">
        <Icon name="shield" className="mt-0.5 size-4" />
        <div>This visit will attach to <b>{projectName}</b>.{projectComplete ? <> That project stays <b>Complete</b> and will not return to the active Projects list.</> : " It won't change that project's status or dates."} The ticket moves to Scheduled, and it resolves itself when the visit is completed.</div>
      </div>
      {state?.conflicts && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-accent-50 p-3 text-sm text-[#78350f]" data-testid="conflict-warning">
          <div className="flex items-center gap-2 font-semibold"><Icon name="alert" className="size-4" />Double-booking</div>
          <ul className="list-disc pl-5">{state.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          <div><button name="force" value="1" className="btn btn-sm btn-accent">Schedule anyway</button> <span className="text-xs">or change the time or tech above.</span></div>
        </div>
      )}
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Link href={cancelHref} scroll={false} className="btn">Cancel</Link>
        <SubmitButton className="btn btn-primary" pendingText="Scheduling…" data-testid="schedule-submit"><Icon name="calendar" />Schedule visit</SubmitButton>
      </div>
    </form>
  );
}
