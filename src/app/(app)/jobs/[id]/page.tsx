import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { JobKindBadge, JobStatusPill, TypeTag } from "@/components/status";
import { PhotoGrid, PhotoUploader } from "@/components/photos";
import { SubmitButton } from "@/components/submit-button";
import { isStaff, requireMember } from "@/lib/auth";
import { hasFleetAccess } from "@/lib/geotab/access";
import { AssignedTruckCard } from "@/components/fleet/assigned-truck-card";
import { getRepo } from "@/lib/data/repo";
import { dayKey, fmtDateTime, fmtDay, fmtRange } from "@/lib/time";
import { ticketNo } from "@/lib/types";
import { addJobNote, approveJob, cancelJob, reopenJob, sendBack, startJob, submitJob } from "../actions";

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const j = await (await getRepo()).getJob((await params).id).catch(() => null);
  return { title: j?.title ?? "Visit" };
}

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const job = await repo.getJob(id);
  if (!job) notFound(); // RLS: techs only get jobs they're assigned to
  const staff = isStaff(user.role);
  const mine = job.assignees.some((a) => a.id === user.id);
  const [project, contacts, before, done, notes, requirements] = await Promise.all([
    repo.getProject(job.project_id), repo.listContacts(job.customer_id),
    repo.listPhotos({ projectId: job.project_id, kind: "before" }), repo.listPhotos({ jobId: id, kind: "completion" }), repo.listNotes({ jobId: id }),
    // the project's required-photo checklist is for the install; warranty/service visits only need a photo + note
    job.kind === "install" ? repo.listPhotoRequirements(job.project_id) : Promise.resolve([]),
  ]);
  // the ticket behind a warranty/service visit (staff, or the tech assigned to this visit)
  const ticket = job.service_request_id ? await repo.getServiceRequest(job.service_request_id).catch(() => null) : null;
  const contact = contacts.find((k) => k.is_primary) ?? contacts[0];
  const canWork = (mine || staff) && job.status === "in_progress";
  const reqDone = requirements.filter((r) => done.some((p) => p.requirement_id === r.id)).length;
  const reqMissing = requirements.filter((r) => !done.some((p) => p.requirement_id === r.id));
  const photosReady = requirements.length ? reqMissing.length === 0 : done.length > 0;
  const ready = photosReady && notes.length > 0;
  const ok = typeof sp.ok === "string" ? sp.ok : null, error = typeof sp.error === "string" ? sp.error : null;
  const dirs = job.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}` : null;

  return (
    <>
      <PageHeader back={staff ? { href: `/projects/${job.project_id}`, label: job.project_name } : { href: "/", label: "My Jobs" }}
        title={<span className="flex flex-wrap items-center gap-2">{job.title}<JobKindBadge kind={job.kind} /><JobStatusPill status={job.status} /></span>}
        sub={<>{job.customer_name} · {job.project_name}</>}
        actions={staff && <>
          {job.status !== "approved" && job.status !== "cancelled" && <Link href={`/jobs/${id}/edit`} className="btn"><Icon name="edit" />Reschedule / reassign</Link>}
          {job.status === "scheduled" && <form action={cancelJob.bind(null, id)}><SubmitButton className="btn btn-danger">Cancel visit</SubmitButton></form>}
          {job.status === "cancelled" && <form action={reopenJob.bind(null, id)}><SubmitButton className="btn"><Icon name="undo" />Reopen</SubmitButton></form>}
        </>} />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {ok && <Banner tone="ok"><Icon name="check" />{ok}</Banner>}
        {error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}
        {job.kind !== "install" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13.5px] text-amber-900" data-testid="warranty-banner">
            <Icon name={job.kind === "warranty" ? "shield" : "wrench"} className="mt-0.5 size-4" />
            <div>
              <b>{job.kind === "warranty" ? "Warranty visit" : "Service visit (billable)"}</b> on the original project{ticket ? <> · {staff ? <Link href={`/service-requests/${ticket.id}`} className="font-semibold underline">{ticketNo(ticket.number)}</Link> : ticketNo(ticket.number)}</> : ""}.
              {ticket && <div className="mt-0.5"><span className="font-semibold">Customer reported:</span> {ticket.summary}{ticket.description && ticket.description !== ticket.summary ? ` — ${ticket.description}` : ""}</div>}
              <div className="mt-0.5 text-[12.5px] text-amber-800">Add a completion photo and a note. Submitting resolves the service request; the project&apos;s status doesn&apos;t change.</div>
            </div>
          </div>
        )}
        {job.status === "in_progress" && job.review_note && (
          <Banner tone="warn"><Icon name="undo" /><div><b>Sent back by your manager:</b> {job.review_note}</div></Banner>
        )}
        {job.status === "completed" && <Banner tone="info"><Icon name="clock" />Submitted {job.completed_at ? fmtDateTime(job.completed_at) : ""}. Waiting for manager review.</Banner>}
        {job.status === "approved" && <Banner tone="ok"><Icon name="check" />Approved {job.approved_at ? fmtDateTime(job.approved_at) : ""}.</Banner>}
      </div>

      <div className={`grid items-start gap-4 ${staff ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card">
            <div className="grid gap-3 p-4 text-sm sm:grid-cols-2">
              <div className="flex gap-2.5"><Icon name="calendar" className="mt-0.5 size-4 text-muted" /><div><div className="font-semibold">{fmtDay(dayKey(job.starts_at), { weekday: "long", month: "long", day: "numeric" })}</div><div className="text-muted">{fmtRange(job.starts_at, job.ends_at)}</div></div></div>
              <div className="flex gap-2.5"><Icon name="pin" className="mt-0.5 size-4 text-muted" /><div className="min-w-0"><div className="font-semibold">{job.customer_name}</div><div className="text-muted">{job.address ?? "No address on file"}</div></div></div>
              {contact && <div className="flex gap-2.5"><Icon name="user" className="mt-0.5 size-4 text-muted" /><div><div className="font-semibold">{contact.name}</div><div className="text-muted">{contact.title ?? "On-site contact"}</div></div></div>}
              <div className="flex items-center gap-1.5"><span className="mr-1 text-muted">Crew</span>{job.assignees.map((a) => <span key={a.id} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-2.5 pl-0.5 text-xs font-medium"><Avatar name={a.full_name} color={a.color} size="sm" src={a.avatar_url} />{a.full_name.split(" ")[0]}</span>)}</div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line p-3">
              {dirs && <a href={dirs} target="_blank" rel="noopener" className="btn btn-primary flex-1 sm:flex-none"><Icon name="nav" />Directions</a>}
              {contact?.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="btn flex-1 sm:flex-none"><Icon name="phone" />Call</a>}
              {contact?.phone && <a href={`sms:${contact.phone.replace(/[^\d+]/g, "")}`} className="btn flex-1 sm:flex-none"><Icon name="text" />Text</a>}
            </div>
          </div>

          {hasFleetAccess(user) && <AssignedTruckCard jobId={job.id} assigneeIds={job.assignees.map((a) => a.id)} />}

          {(mine || staff) && job.status === "scheduled" && (
            <form action={startJob.bind(null, id)}><SubmitButton className="btn btn-accent w-full py-3 text-base" pendingText="Starting…"><Icon name="play" />Start job</SubmitButton></form>
          )}

          {canWork && requirements.length > 0 && (
            <div className="card border-amber-300" data-testid="completion">
              <div className="card-hd"><h3 className="font-semibold">Required photos</h3><span className="text-xs text-muted">{reqDone} of {requirements.length} done</span></div>
              <div className="flex flex-col gap-3 p-4">
                <div className="flex gap-1">
                  {requirements.map((r) => {
                    const ok = done.some((p) => p.requirement_id === r.id);
                    return <div key={r.id} className={`h-2 flex-1 rounded-full ${ok ? "bg-green-500" : "bg-slate-200"}`} title={r.label} />;
                  })}
                </div>
                {reqMissing.length > 0
                  ? <p className="text-sm font-medium text-orange-700">{reqMissing.length === 1 ? `1 photo still needed: ${reqMissing[0].label}` : `${reqMissing.length} photos still needed: ${reqMissing.map((m) => m.label).join(", ")}`}</p>
                  : <p className="text-sm font-medium text-green-700">All required photos captured</p>}
                <ul className="flex flex-col gap-1 text-sm">
                  <li className={notes.length ? "text-green-700" : "text-muted"}><Icon name={notes.length ? "check" : "note"} className="mr-1.5 inline size-4" />{notes.length ? `${notes.length} note${notes.length > 1 ? "s" : ""}` : "Add a note about the work done"}</li>
                </ul>
                <Link href={`/jobs/${id}/required-photos`} className="btn btn-primary w-full py-3 text-base"><Icon name="camera" />Open required photos</Link>
                <form action={addJobNote.bind(null, id)} className="flex flex-col gap-2">
                  <textarea name="body" required className="input min-h-20" placeholder="What did you do? Fixture counts, issues, anything the office should know…" aria-label="Note" />
                  <SubmitButton className="btn self-start"><Icon name="note" />Add note</SubmitButton>
                </form>
                <form action={submitJob.bind(null, id)}>
                  <SubmitButton className={`btn w-full py-3 text-base ${ready ? "btn-primary" : ""}`} pendingText="Submitting…"><Icon name="flag" />Mark complete &amp; submit for review</SubmitButton>
                  {!ready && <p className="mt-1.5 text-center text-xs text-muted">{photosReady ? "Add a note before submitting." : "Capture every required photo and add a note."}</p>}
                </form>
              </div>
            </div>
          )}

          {canWork && requirements.length === 0 && (
            <div className="card border-amber-300" data-testid="completion">
              <div className="card-hd"><h3 className="font-semibold">Finish this job</h3><span className="text-xs text-muted">photos + note required</span></div>
              <div className="flex flex-col gap-4 p-4">
                <ul className="flex flex-col gap-1 text-sm">
                  <li className={done.length ? "text-green-700" : "text-muted"}><Icon name={done.length ? "check" : "camera"} className="mr-1.5 inline size-4" />{done.length ? `${done.length} completion photo${done.length > 1 ? "s" : ""}` : "Add at least one completion photo"}</li>
                  <li className={notes.length ? "text-green-700" : "text-muted"}><Icon name={notes.length ? "check" : "note"} className="mr-1.5 inline size-4" />{notes.length ? `${notes.length} note${notes.length > 1 ? "s" : ""}` : "Add a note about the work done"}</li>
                </ul>
                <PhotoUploader projectId={job.project_id} jobId={id} kind="completion" />
                <PhotoGrid photos={done} canDelete={staff} empty="No completion photos yet." />
                <form action={addJobNote.bind(null, id)} className="flex flex-col gap-2">
                  <textarea name="body" required className="input min-h-20" placeholder="What did you do? Fixture counts, issues, anything the office should know…" aria-label="Note" />
                  <SubmitButton className="btn self-start"><Icon name="note" />Add note</SubmitButton>
                </form>
                <form action={submitJob.bind(null, id)}>
                  <SubmitButton className={`btn w-full py-3 text-base ${ready ? "btn-primary" : ""}`} pendingText="Submitting…"><Icon name="flag" />Mark complete &amp; submit for review</SubmitButton>
                  {!ready && <p className="mt-1.5 text-center text-xs text-muted">Needs at least one completion photo and a note.</p>}
                </form>
              </div>
            </div>
          )}

          {staff && job.status === "completed" && (
            <div className="card border-violet-300" data-testid="review">
              <div className="card-hd"><h3 className="font-semibold">Review</h3><span className="text-xs text-muted">{done.length} photos · {notes.length} notes</span></div>
              <div className="flex flex-col gap-3 p-4">
                {job.review_note && <div className="text-xs text-muted">Previously sent back: “{job.review_note}”</div>}
                <form action={approveJob.bind(null, id)}><SubmitButton className="btn btn-primary w-full"><Icon name="check" />Approve</SubmitButton></form>
                <form action={sendBack.bind(null, id)} className="flex flex-col gap-2">
                  <textarea name="review_note" required className="input min-h-16" placeholder="What needs fixing? The tech will see this." aria-label="Send back note" />
                  <SubmitButton className="btn"><Icon name="undo" />Send back to tech</SubmitButton>
                </form>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Scope of work</h3>{project && <TypeTag type={project.type} />}</div>
            <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed">{project?.scope || <span className="text-muted">No scope written.</span>}</div>
            {job.instructions && <div className="border-t border-line bg-accent-50/50 p-4 text-sm"><div className="mb-1 text-xs font-bold tracking-wide text-amber-800 uppercase">Visit instructions</div><div className="whitespace-pre-wrap">{job.instructions}</div></div>}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Before photos</h3><span className="text-xs text-muted">{before.length}</span></div>
            <div className="p-4"><PhotoGrid photos={before} empty="No before photos on this project." /></div>
          </div>
          {!canWork && (
            <div className="card">
              <div className="card-hd"><h3 className="font-semibold">Completion photos</h3><span className="text-xs text-muted">{done.length}</span></div>
              <div className="p-4"><PhotoGrid photos={done} canDelete={staff} empty={job.status === "scheduled" ? "Start the job to add completion photos." : "No completion photos."} /></div>
            </div>
          )}
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Notes</h3><span className="text-xs text-muted">{notes.length}</span></div>
            <ol className="divide-y divide-line">
              {notes.length === 0 && <li className="p-4 text-center text-sm text-muted">No notes yet.</li>}
              {notes.map((n) => <li key={n.id} className="flex gap-2.5 px-4 py-3 text-sm"><Avatar name={n.author_name} color={n.author_color} size="sm" /><div className="min-w-0 flex-1"><div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div><div className="whitespace-pre-wrap">{n.body}</div></div></li>)}
            </ol>
            {!canWork && (mine || staff) && job.status !== "cancelled" && (
              <form action={addJobNote.bind(null, id)} className="flex gap-2 border-t border-line p-3">
                <input name="body" required className="input" placeholder="Add a note…" aria-label="Note" /><SubmitButton className="btn">Add</SubmitButton>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
