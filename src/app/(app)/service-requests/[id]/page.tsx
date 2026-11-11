import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { AvatarStack, JobKindBadge, JobStatusPill, PriorityPill, ProjectStatusPill, SRStatusPill, TypeTag } from "@/components/status";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { countLabel, hasDeleteAccess } from "@/lib/delete-access";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { deleteServiceRequestAction } from "@/app/(app)/delete-actions";
import { hasFleetAccess } from "@/lib/geotab/access";
import { AssignedTruckCard } from "@/components/fleet/assigned-truck-card";
import { getRepo } from "@/lib/data/repo";
import { ageText, formatAddress } from "@/lib/project-row";
import { fmtDate, fmtReceived, visitDefaults } from "@/lib/tickets";
import { dayKey, fmtDateTime, fmtDay, fmtRange, todayKey, addDays } from "@/lib/time";
import { DEFAULT_WARRANTY_MONTHS, PROJECT_TYPE_LABEL, SR_CHANNEL_LABEL, SR_OPEN, ticketNo, type SREvent } from "@/lib/types";
import {
  addTicketNote, assignTicket, convertTicket, finishTicket, linkProject, markTriaged, reopenTicket, setBillable, unlinkProject,
} from "../actions";
import { ScheduleVisitForm } from "./schedule-form";

export async function generateMetadata({ params }: PageProps<"/service-requests/[id]">): Promise<Metadata> {
  const sr = await (await getRepo()).getServiceRequest((await params).id).catch(() => null);
  return { title: sr ? `${ticketNo(sr.number)} · ${sr.summary}` : "Service request" };
}

const EV_ICON: Record<SREvent["kind"], string> = {
  created: "plus", note: "note", status: "flag", linked: "briefcase", unlinked: "x", assigned: "user", billable: "dollar",
  scheduled: "calendar", converted: "briefcase", resolved: "check", closed: "check", reopened: "undo",
};

export default async function ServiceRequestPage({ params, searchParams }: PageProps<"/service-requests/[id]">) {
  const user = await requireRole("admin", "manager");
  const canDelete = hasDeleteAccess(user);
  const { id } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const repo = await getRepo();
  const sr = await repo.getServiceRequest(id);
  if (!sr) notFound();
  const pq = str("pq");
  const picking = str("link") === "1" || !!pq;
  const [events, visits, people, project, picks] = await Promise.all([
    repo.listServiceRequestEvents(id), repo.listJobs({ serviceRequestId: id }), repo.listAssignable(),
    sr.project_id ? repo.getProject(sr.project_id) : Promise.resolve(null),
    picking ? repo.findProjects(pq ? { q: pq, limit: 10 } : { customerId: sr.customer_id, limit: 10 }) : Promise.resolve([]),
  ]);
  const notes = events.filter((e) => e.kind === "note");
  const history = events.filter((e) => e.kind !== "note");
  const staffPeople = people.filter((p) => p.role === "admin" || p.role === "manager");
  const techs = people.filter((p) => p.role === "tech");
  const open = SR_OPEN.includes(sr.status);
  const base = `/service-requests/${id}`;
  const ok = str("ok"), error = str("error");
  const site = formatAddress({ address: sr.site_address, city: sr.site_city, state: sr.site_state, zip: sr.site_zip });
  const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

  // warranty box
  const months = sr.warranty_months ?? DEFAULT_WARRANTY_MONTHS;
  const used = sr.project_completed_at ? Math.max(0, Math.min(months, monthsBetween(sr.project_completed_at, new Date().toISOString()))) : 0;
  const expired = sr.warranty_expires_at ? new Date(sr.warranty_expires_at) < new Date() : false;
  const coverage = `${months % 12 === 0 ? `${months / 12}-year` : `${months}-month`} ${sr.project_type ? PROJECT_TYPE_LABEL[sr.project_type].toLowerCase() : ""} warranty`.replace("  ", " ");

  const scheduling = str("schedule") === "1" && open;
  const defaults = visitDefaults(sr);
  const tomorrow = addDays(todayKey(), 1);

  return (
    <>
      <PageHeader back={{ href: "/service-requests", label: "Service requests" }}
        title={<span className="flex flex-wrap items-center gap-2"><span data-testid="ticket-number">{ticketNo(sr.number)}</span><SRStatusPill status={sr.status} /><PriorityPill priority={sr.priority} />{sr.billable && <span className="pill bg-orange-50 text-orange-800">Billable</span>}</span>}
        sub={<>{sr.summary} · <Link href={`/customers/${sr.customer_id}`} className="font-semibold text-brand">{sr.customer_name}</Link> · Received {fmtReceived(sr.received_at).replace(/^Today/, "today at")} via {SR_CHANNEL_LABEL[sr.channel].toLowerCase()}</>}
        actions={canDelete ? <Link href={`/service-requests/${id}?delete=1`} scroll={false} className="btn btn-danger" data-testid="delete-button"><Icon name="trash" />Delete</Link> : undefined} />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {ok && <Banner tone="ok"><Icon name="check" />{ok}</Banner>}
        {error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}
        {sr.status === "converted" && sr.converted_project_id && <Banner tone="info"><Icon name="briefcase" /><div>Converted to a new project. <Link href={`/projects/${sr.converted_project_id}`} className="font-semibold underline">Open the project</Link></div></Banner>}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Issue</h3><span className="text-xs text-muted">Logged from {sr.channel === "email" ? "an email" : sr.channel === "call" ? "a phone call" : "another channel"} · {fmtDateTime(sr.received_at)}</span></div>
            <div className="p-5 text-sm leading-relaxed">
              <div className="mb-1 font-semibold">{sr.summary}</div>
              <div className="whitespace-pre-wrap">{sr.description || <span className="text-muted">No details written.</span>}</div>
            </div>
          </div>

          <div className="card" data-testid="ticket-notes">
            <div className="card-hd"><h3 className="font-semibold">Notes</h3><span className="text-xs text-muted">Internal · not sent to the customer</span></div>
            <ol className="divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id} className="flex gap-2.5 px-5 py-3 text-sm"><Avatar name={n.actor_name} color={n.actor_color} size="sm" />
                  <div className="min-w-0 flex-1"><div className="text-xs text-muted">{n.actor_name} · {fmtDateTime(n.created_at)}</div><div className="whitespace-pre-wrap">{n.body}</div></div></li>
              ))}
            </ol>
            <form action={addTicketNote.bind(null, id)} className="flex gap-2 border-t border-line p-4">
              <input name="body" required className="input" placeholder="Add an internal note…" aria-label="Note" maxLength={5000} />
              <SubmitButton className="btn btn-primary">Add note</SubmitButton>
            </form>
          </div>

          <div className="card" data-testid="ticket-visits">
            <div className="card-hd"><h3 className="font-semibold">Visits</h3><span className="text-xs text-muted">Warranty and service visits for this ticket</span></div>
            <div className="divide-y divide-line">
              {!visits.length && <div className="p-5 text-sm text-muted">No visit yet. A ticket can wait here unscheduled; a visit never reopens the original project.</div>}
              {visits.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-[#fafbf9]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">{j.title}<JobKindBadge kind={j.kind} size="sm" /></div>
                    <div className="text-[12.5px] text-muted">{fmtDay(dayKey(j.starts_at), { weekday: "short", month: "short", day: "numeric" })} · {fmtRange(j.starts_at, j.ends_at)}</div>
                  </div>
                  <AvatarStack people={j.assignees} max={3} /><JobStatusPill status={j.status} />
                </Link>
              ))}
            </div>
          </div>

          {hasFleetAccess(user) && (visits.find((j) => j.status === "in_progress" || j.status === "scheduled") ?? visits[0]) && (
            <AssignedTruckCard
              jobId={(visits.find((j) => j.status === "in_progress" || j.status === "scheduled") ?? visits[0]).id}
              assigneeIds={(visits.find((j) => j.status === "in_progress" || j.status === "scheduled") ?? visits[0]).assignees.map((a) => a.id)}
            />
          )}

          <div className="card" data-testid="ticket-history">
            <div className="card-hd"><h3 className="font-semibold">History</h3><span className="text-xs text-muted">Ticket timeline</span></div>
            <ol className="relative px-5 py-4">
              {history.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < history.length - 1 && <span className="absolute top-6 left-[11px] h-[calc(100%-16px)] w-px bg-line" />}
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-white"><Icon name={EV_ICON[e.kind]} className="size-3.5" /></span>
                  <div className="min-w-0 text-sm"><div className="font-medium">{e.body}</div><div className="text-xs text-muted">{e.actor_name} · {fmtDateTime(e.created_at)}</div></div>
                </li>
              ))}
              {open && (
                <li className="relative flex gap-3 pt-1">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-brand text-brand"><Icon name="clock" className="size-3.5" /></span>
                  <div className="text-sm"><div className="font-medium">{sr.status === "scheduled" ? "Waiting for the visit" : "Waiting to be scheduled"}</div>
                    <div className="text-xs text-muted">{sr.status === "scheduled" ? "Resolves itself when the visit is completed." : "The ticket can sit unscheduled. A visit will not reopen the original project."}</div></div>
                </li>
              )}
            </ol>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Customer &amp; contact</h3><Link href={`/customers/${sr.customer_id}`} className="text-xs font-semibold text-brand">Open customer</Link></div>
            <div className="flex flex-col gap-2 p-5 text-sm">
              <div><div className="font-semibold">{sr.customer_name}</div>{sr.contact_name && <div className="text-muted">{sr.contact_name}</div>}</div>
              {site && <div className="flex gap-2"><Icon name="pin" className="mt-0.5 size-4 text-muted" />{site}</div>}
              {sr.contact_phone && <div className="flex gap-2"><Icon name="phone" className="mt-0.5 size-4 text-muted" />{sr.contact_phone}</div>}
              {sr.contact_email && <div className="flex gap-2 break-all"><Icon name="mail" className="mt-0.5 size-4 text-muted" />{sr.contact_email}</div>}
              <div className="flex gap-2 pt-1">
                {sr.contact_phone && <a href={tel(sr.contact_phone)} className="btn btn-sm"><Icon name="phone" className="size-4" />Call</a>}
                {site && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site)}`} target="_blank" rel="noopener" className="btn btn-sm"><Icon name="nav" className="size-4" />Directions</a>}
              </div>
            </div>
          </div>

          <div className="card" data-testid="original-project">
            <div className="card-hd"><h3 className="font-semibold">Original project</h3>{project && <Link href={`/projects/${project.id}`} className="text-xs font-semibold text-brand">Open project</Link>}</div>
            {project ? (
              <div className="flex flex-col gap-2 p-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{project.name}</span><ProjectStatusPill status={project.status} /></div>
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted"><TypeTag type={project.type} />{sr.project_completed_at ? `Completed ${fmtDate(sr.project_completed_at)}` : "Not finished yet"}</div>
                {project.scope && <p className="line-clamp-3 text-[12.5px] text-muted">{project.scope}</p>}
                <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-[12.5px] text-[#134e4a]"><Icon name="shield" className="mt-0.5 size-4" />
                  <div>A warranty visit attaches to this project. It stays <b>{project.status === "complete" ? "Complete" : "as it is"}</b> and will not reappear in the active Projects list.</div></div>
                {open && <div className="flex gap-3 text-[12.5px]">
                  <form action={unlinkProject.bind(null, id)}><SubmitButton className="font-semibold text-muted hover:text-ink" pendingText="Unlinking…">Unlink project</SubmitButton></form>
                  <Link href={`${base}?link=1`} scroll={false} className="font-semibold text-brand">Change</Link>
                </div>}
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-5 text-sm">
                <p className="text-muted">No project linked. Match the job we did at this site so the warranty can be checked, or convert the ticket if it is new work.</p>
                {!picking && open && <Link href={`${base}?link=1`} scroll={false} className="btn btn-sm self-start" data-testid="link-project"><Icon name="search" className="size-4" />Find original project</Link>}
              </div>
            )}
            {picking && open && (
              <div className="border-t border-line p-4" data-testid="project-picker">
                <form className="mb-3 flex gap-2" role="search">
                  <input type="hidden" name="link" value="1" />
                  <input name="pq" defaultValue={pq} className="input" placeholder="Search projects by name or customer…" aria-label="Search projects" />
                  <button className="btn btn-sm">Search</button>
                </form>
                <div className="mb-2 text-xs text-muted">{pq ? `Up to 10 projects matching “${pq}”` : `${sr.customer_name}'s 10 most recent projects`}</div>
                <ul className="flex flex-col gap-1.5">
                  {!picks.length && <li className="text-sm text-muted">No projects found.</li>}
                  {picks.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.name}</div>
                        <div className="truncate text-xs text-muted">{p.customer_name} · {PROJECT_TYPE_LABEL[p.type]} · {p.completed_at ? `completed ${fmtDate(p.completed_at)}` : "not finished"}</div></div>
                      {p.id === sr.project_id ? <span className="text-xs text-muted">Linked</span>
                        : <form action={linkProject.bind(null, id, p.id)}><SubmitButton className="btn btn-sm" pendingText="Linking…">Link</SubmitButton></form>}
                    </li>
                  ))}
                </ul>
                <Link href={base} scroll={false} className="mt-2 inline-block text-xs font-semibold text-muted">Cancel</Link>
              </div>
            )}
          </div>

          <div className={`card ${sr.warranty_state === "in" ? "border-green-200 bg-green-50/60" : sr.warranty_state === "out" ? "border-red-200 bg-red-50/50" : ""}`} data-testid="warranty-box">
            <div className="flex items-center gap-2 px-5 pt-4 font-semibold">
              <Icon name="shield" className={`size-4 ${sr.warranty_state === "in" ? "text-green-700" : sr.warranty_state === "out" ? "text-red-700" : "text-muted"}`} />
              <span className={sr.warranty_state === "in" ? "text-green-800" : sr.warranty_state === "out" ? "text-red-800" : ""}>{sr.warranty_state === "in" ? "In warranty" : sr.warranty_state === "out" ? "Out of warranty" : "Warranty unknown"}</span>
            </div>
            {sr.project_completed_at && sr.warranty_expires_at ? (
              <div className="p-5 pt-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted">Coverage</div><div className="font-medium">{coverage}</div></div>
                  <div><div className="text-xs text-muted">{expired ? "Expired" : "Expires"}</div><div className="font-medium">{fmtDate(sr.warranty_expires_at)}</div></div>
                  <div><div className="text-xs text-muted">Work completed</div><div className="font-medium">{fmtDate(sr.project_completed_at)}</div></div>
                  <div><div className="text-xs text-muted">Time since</div><div className="font-medium">{ageText(sr.project_completed_at)}</div></div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${sr.warranty_state === "in" ? "bg-green-600" : "bg-red-500"}`} style={{ width: `${months ? Math.round((used / months) * 100) : 100}%` }} /></div>
                <div className="mt-1.5 text-xs text-muted">
                  {sr.warranty_state === "in"
                    ? <>Reported inside the window ({fmtDate(sr.received_at)}){expired ? "" : `, ${Math.max(0, months - used)} months remaining`}. Covered, not billable by default.</>
                    : <>Reported {ageText(sr.warranty_expires_at, sr.received_at)} after the warranty ended. Usually billable; schedule a Service visit.</>}
                  {" "}Warranty length is set on the project ({months} months{months === DEFAULT_WARRANTY_MONTHS ? ", the default" : ""}).
                </div>
              </div>
            ) : (
              <p className="p-5 pt-2 text-sm text-muted">{sr.project_id ? "The original project isn't finished yet, so there's no warranty date." : "Link the original project to check the warranty."}</p>
            )}
          </div>

          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Assignment</h3><span className="text-xs text-muted">Office owner</span></div>
            <form action={assignTicket.bind(null, id)} className="flex gap-2 p-4">
              <select name="assignee_id" defaultValue={sr.assignee_id ?? ""} className="input" aria-label="Assignee">
                <option value="">No one yet</option>{staffPeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <SubmitButton className="btn">Assign</SubmitButton>
            </form>
          </div>

          <div className="card" data-testid="ticket-actions">
            <div className="card-hd"><h3 className="font-semibold">Actions</h3></div>
            <div className="flex flex-col gap-2 p-4">
              {open ? <>
                {sr.project_id
                  ? <Link href={`${base}?schedule=1`} scroll={false} className="btn btn-primary" data-testid="schedule-visit"><Icon name="calendar" />Schedule {defaults.kind === "warranty" ? "warranty" : "service"} visit</Link>
                  : <span className="btn btn-primary pointer-events-none opacity-50" aria-disabled="true" title="Link the original project first"><Icon name="calendar" />Schedule visit</span>}
                {!sr.project_id && <p className="-mt-1 text-center text-xs text-muted">Link the original project first, or convert to a new project.</p>}
                {sr.status === "new" && <form action={markTriaged.bind(null, id)} className="contents"><SubmitButton className="btn"><Icon name="flag" />Mark triaged</SubmitButton></form>}
                <form action={setBillable.bind(null, id, !sr.billable)} className="contents"><SubmitButton className="btn"><Icon name="dollar" />{sr.billable ? "Mark not billable" : "Mark billable"}</SubmitButton></form>
                <form action={convertTicket.bind(null, id)} className="contents"><SubmitButton className="btn" pendingText="Creating project…"><Icon name="briefcase" />Convert to project</SubmitButton></form>
                <details className="group">
                  <summary className="btn w-full cursor-pointer list-none"><Icon name="check" />Resolve or close…</summary>
                  <form className="mt-2 flex flex-col gap-2 rounded-lg border border-line p-3">
                    <input name="reason" className="input" placeholder="What was done / why (optional)" aria-label="Reason" />
                    <div className="grid grid-cols-2 gap-2">
                      <SubmitButton className="btn btn-primary" formAction={finishTicket.bind(null, id, "resolved")}>Resolve</SubmitButton>
                      <SubmitButton className="btn" formAction={finishTicket.bind(null, id, "closed")}>Close</SubmitButton>
                    </div>
                    <p className="text-[11.5px] text-muted">Resolve = fixed or answered. Close = no work needed (duplicate, not ours, sent to sales).</p>
                  </form>
                </details>
              </> : <>
                <p className="text-sm text-muted">{sr.status === "converted" ? "This ticket became a new project." : `${sr.status === "resolved" ? "Resolved" : "Closed"} ${sr.resolved_at ? fmtDateTime(sr.resolved_at) : ""}.`}</p>
                {sr.status !== "converted" && <form action={reopenTicket.bind(null, id)} className="contents"><SubmitButton className="btn"><Icon name="undo" />Reopen</SubmitButton></form>}
              </>}
            </div>
          </div>
        </div>
      </div>

      {scheduling && project && (
        <Modal title={`Schedule ${defaults.kind} visit`} sub={`${ticketNo(sr.number)} · ${sr.customer_name}`} closeHref={base}>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4 text-xs">
            <span className={`pill ${sr.warranty_state === "in" ? "bg-amber-50 text-amber-800" : sr.warranty_state === "out" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{sr.warranty_state === "in" ? "In warranty" : sr.warranty_state === "out" ? "Out of warranty" : "Warranty unknown"}</span>
            <TypeTag type={project.type} />
            {sr.warranty_expires_at && <span className="text-muted">{expired ? "Expired" : "Expires"} {fmtDate(sr.warranty_expires_at)}</span>}
          </div>
          <ScheduleVisitForm requestId={id} projectName={project.name} projectComplete={project.status === "complete"} cancelHref={base}
            people={techs.length ? techs : people}
            d={{ title: defaults.title, kind: defaults.kind, date: tomorrow, start: "09:00", end: "11:00", instructions: sr.description }} />
        </Modal>
      )}
      {canDelete && str("delete") === "1" && (
        <DeleteConfirmDialog
          title="Delete service request"
          itemName={`${ticketNo(sr.number)} · ${sr.summary}`}
          cancelHref={`/service-requests/${id}`}
          action={deleteServiceRequestAction.bind(null, id)}
          consequences={[
            "This ticket and its history are removed",
            visits.length
              ? `${countLabel(visits.length, "linked visit stays", "linked visits stay")} on the project but will no longer point at this ticket`
              : "No visits are linked to this ticket",
          ]}
          confirmLabel="Delete request"
        />
      )}
    </>
  );
}

function monthsBetween(a: string, b: string) {
  const x = new Date(a), y = new Date(b);
  let m = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  if (y.getUTCDate() < x.getUTCDate()) m -= 1;
  return m;
}
