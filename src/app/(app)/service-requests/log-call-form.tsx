"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ProjectStatusPill } from "@/components/status";
import { ageText, warrantyFor } from "@/lib/project-row";
import { dayKey, fmtDay } from "@/lib/time";
import { PROJECT_TYPE_LABEL, type ProjectPick, type SRChannel } from "@/lib/types";
import { CustomerPicker, type CustomerHit } from "@/components/customer-picker";
import { SubmitButton } from "@/components/submit-button";
import { createTicket, customerPrefill, type CustomerPrefill } from "./actions";

const fmtD = (iso: string) => fmtDay(dayKey(iso), { month: "short", day: "numeric", year: "numeric" });

/** Log a call / email as a new service request. Customer search is bounded (10 matches); suggestions are the customer's latest 10 projects. */
export function LogCallForm({ cancelHref, now }: { cancelHref: string; now: string }) {
  const [state, action] = useActionState(createTicket, undefined);
  const v = state?.values ?? {};
  const [channel, setChannel] = useState<SRChannel>((v.channel as SRChannel) || "call");
  const [q, setQ] = useState(v.customer_name ?? "");
  const [cust, setCust] = useState<CustomerPrefill | null>(null);
  const [projectId, setProjectId] = useState<string>(v.project_id ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (v.customer_id && !cust) customerPrefill(v.customer_id).then((c) => {
      if (!c) return;
      setCust(c);
      setQ(c.name);
    });
  }, [v.customer_id, cust]);

  async function onCustomer(h: CustomerHit | null) {
    if (!h) {
      setQ(""); setCust(null); setProjectId("");
      return;
    }
    setQ(h.name);
    const c = await customerPrefill(h.id);
    if (!c) return;
    setCust(c);
    const f = formRef.current;
    if (f) for (const k of ["site_address", "site_city", "site_state", "site_zip", "contact_name", "contact_phone", "contact_email"] as const) {
      const el = f.elements.namedItem(k) as HTMLInputElement | null;
      if (el && !el.value) el.value = c[k];
    }
    const done = c.projects.find((p) => p.completed_at);
    setProjectId(done?.id ?? "");
  }
  const suggestion = (p: ProjectPick) => {
    if (!p.completed_at) return "Not finished yet";
    const w = warrantyFor(p.completed_at, p.warranty_months, new Date().toISOString());
    return w.state === "in" ? `In warranty until ${fmtD(w.expires!)}` : `Warranty ended ${fmtD(w.expires!)}`;
  };

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4 p-5" data-testid="log-call-form">
      <input type="hidden" name="customer_name" value={q} />
      <input type="hidden" name="project_id" value={projectId} />
      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">Channel</legend>
        <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
          {([["call", "phone", "Phone"], ["email", "mail", "Email"], ["other", "note", "Other"]] as const).map(([c, icon, label]) => (
            <label key={c} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${channel === c ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
              <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="sr-only" /><Icon name={icon} className="size-4" />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="label">Customer *
        <CustomerPicker
          name="customer_id"
          required
          defaultSelectedId={v.customer_id}
          onChange={onCustomer}
          noMatchHint={<>No customers match. <Link href="/customers/new" className="font-semibold text-brand">Add a customer</Link> first.</>}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1.2fr_.6fr_.9fr]">
        <label className="label">Site address<input className="input" name="site_address" defaultValue={v.site_address} placeholder="Street" /></label>
        <label className="label">City<input className="input" name="site_city" defaultValue={v.site_city} /></label>
        <label className="label">State<input className="input" name="site_state" defaultValue={v.site_state} maxLength={2} /></label>
        <label className="label">Zip<input className="input" name="site_zip" defaultValue={v.site_zip} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="label">{channel === "email" ? "Who wrote" : "Who called"}<input className="input" name="contact_name" defaultValue={v.contact_name} placeholder="Name, role" /></label>
        <label className="label">Phone<input className="input" name="contact_phone" defaultValue={v.contact_phone} inputMode="tel" /></label>
        <label className="label">Email<input className="input" name="contact_email" defaultValue={v.contact_email} type="email" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Received<input className="input" type="datetime-local" name="received_at" defaultValue={v.received_at ?? now} max={now} /></label>
        <label className="label">Priority
          <select className="input" name="priority" defaultValue={v.priority ?? "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select>
        </label>
      </div>
      <label className="label">Short summary *<input className="input" name="summary" required maxLength={200} defaultValue={v.summary} placeholder="e.g. Exam room 2 fixture flickering" /></label>
      <label className="label">What did they say?<textarea className="input min-h-24 font-normal" name="description" defaultValue={v.description} placeholder="Where, what's wrong, since when, anything they asked for…" /></label>
      {cust && (
        <fieldset data-testid="suggested-projects">
          <legend className="mb-1.5 text-[12.5px] font-semibold text-[#3d4744]">Suggested original project</legend>
          {!cust.projects.length && <p className="text-sm text-muted">No projects for {cust.name} yet. Leave it unlinked, or convert the ticket into a project later.</p>}
          <div className="flex flex-col gap-2">
            {cust.projects.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-50">
                <input type="radio" name="project_pick" checked={projectId === p.id} onChange={() => setProjectId(p.id)} className="mt-1 size-4 accent-[var(--color-brand)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{p.name}</span><ProjectStatusPill status={p.status} /></div>
                  <div className="text-[12.5px] text-muted">{PROJECT_TYPE_LABEL[p.type]}{p.completed_at ? ` · Completed ${fmtD(p.completed_at)} · ${ageText(p.completed_at)} ago` : ""}</div>
                  <div className="text-[12.5px] text-muted">{suggestion(p)}</div>
                </div>
              </label>
            ))}
            {cust.projects.length > 0 && (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-50">
                <input type="radio" name="project_pick" checked={!projectId} onChange={() => setProjectId("")} className="size-4 accent-[var(--color-brand)]" />
                <span>Leave unlinked. You can match it later.</span>
              </label>
            )}
          </div>
        </fieldset>
      )}
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        <span className="text-[11.5px] text-muted">Nothing is emailed or texted to the customer.</span>
        <div className="flex gap-2"><Link href={cancelHref} scroll={false} className="btn">Cancel</Link><SubmitButton className="btn btn-primary" pendingText="Creating…" data-testid="create-request">Create request</SubmitButton></div>
      </div>
    </form>
  );
}
