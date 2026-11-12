import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner } from "@/components/ui";
import { JobKindBadge, JobStatusPill, TypeTag } from "@/components/status";
import { PhotoGrid, PhotoUploader } from "@/components/photos";
import { RequiredPhotoSlots } from "@/components/required-photo-slots";
import { SubmitButton } from "@/components/submit-button";
import { isStaff, requireMember } from "@/lib/auth";
import { countLabel, hasDeleteAccess } from "@/lib/delete-access";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { deleteVisitAction } from "@/app/(app)/delete-actions";
import { hasFleetAccess } from "@/lib/geotab/access";
import { AssignedTruckCard } from "@/components/fleet/assigned-truck-card";
import { getRepo } from "@/lib/data/repo";
import { dayKey, fmtDateTime, fmtDay, fmtRange } from "@/lib/time";
import { ticketNo } from "@/lib/types";
import { addJobNote, approveJob, cancelJob, reopenJob, sendBack, startJob, submitJob } from "../actions";
import { parseScopeItems } from "@/lib/scope-items";
import { bucketPhotosByPhase } from "@/lib/photo-phase";
import { visitStepper } from "@/lib/project-progress";
import {
  ActionMenu, ProfileHeader, ProfileTabs, RailCard, ScopeTable, Stepper,
  formatStreetAddress, mapsDirUrl, mapsSearchUrl, menuLink, telHref, smsHref,
} from "@/components/profile-chrome";

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const j = await (await getRepo()).getJob((await params).id).catch(() => null);
  return { title: j?.title ?? "Visit" };
}

const TABS = ["overview", "photos", "notes"] as const;
type Tab = (typeof TABS)[number];

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const job = await repo.getJob(id);
  if (!job) notFound(); // RLS: techs only get jobs they're assigned to
  const staff = isStaff(user.role);
  const canDelete = hasDeleteAccess(user);
  const mine = job.assignees.some((a) => a.id === user.id);
  const tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const [project, contacts, visitPhotos, projectPhotos, notes, requirements] = await Promise.all([
    repo.getProject(job.project_id), repo.listContacts(job.customer_id),
    repo.listPhotos({ jobId: id }), repo.listPhotos({ projectId: job.project_id }), repo.listNotes({ jobId: id }),
    // the project's required-photo checklist is for the install; warranty/service visits only need a photo + note
    job.kind === "install" ? repo.listPhotoRequirements(job.project_id) : Promise.resolve([]),
  ]);
  const phases = bucketPhotosByPhase(visitPhotos);
  const before = phases.before;
  const done = visitPhotos.filter((ph) => ph.kind === "completion");
  const projectBefores = projectPhotos.filter((ph) => !ph.job_id && ph.phase === "before");
  // the ticket behind a warranty/service visit (staff, or the tech assigned to this visit)
  const ticket = job.service_request_id ? await repo.getServiceRequest(job.service_request_id).catch(() => null) : null;
  const contact = contacts.find((k) => k.is_primary) ?? contacts[0];
  const canWork = (mine || staff) && job.status === "in_progress";
  const canUploadPhotos = staff ? job.status !== "cancelled" : canWork;
  const canManagePhotos = staff || canWork;
  const reqDone = requirements.filter((r) => done.some((p) => p.requirement_id === r.id)).length;
  const reqMissing = requirements.filter((r) => !done.some((p) => p.requirement_id === r.id));
  const photosReady = requirements.length ? reqMissing.length === 0 : done.length > 0;
  const ready = photosReady && notes.length > 0;
  const ok = typeof sp.ok === "string" ? sp.ok : null, error = typeof sp.error === "string" ? sp.error : null;
  const dirs = job.address ? mapsDirUrl(job.address) : null;
  const photoCount = visitPhotos.length;
  const base = `/jobs/${id}`;
  const steps = visitStepper(job.status);
  const customer = await repo.getCustomer(job.customer_id).catch(() => null);
  const addr = job.address || (customer ? formatStreetAddress(customer) : "");

  return (
    <>
      <ProfileHeader
        back={staff ? { href: `/projects/${job.project_id}`, label: job.project_name } : { href: "/", label: "My Jobs" }}
        title={job.title}
        afterTitle={<>
          <JobKindBadge kind={job.kind} />
          <JobStatusPill status={job.status} />
        </>}
        sub={<>
          {staff ? <Link href={`/customers/${job.customer_id}`} className="font-semibold text-brand">{job.customer_name}</Link> : job.customer_name}
          {" · "}{job.project_name}
          {addr ? <> · <span className="break-words">{addr}</span></> : null}
          {" · "}{fmtDay(dayKey(job.starts_at), { weekday: "short", month: "short", day: "numeric" })} · {fmtRange(job.starts_at, job.ends_at)}
        </>}
        actions={staff && <>
          {job.status !== "approved" && job.status !== "cancelled" && <Link href={`/jobs/${id}/edit`} className="btn"><Icon name="edit" />Reschedule / reassign</Link>}
          {(job.status === "scheduled" || job.status === "cancelled" || canDelete) && (
            <ActionMenu>
              {job.status === "scheduled" && (
                <form action={cancelJob.bind(null, id)}><button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-canvas">Cancel visit</button></form>
              )}
              {job.status === "cancelled" && (
                <form action={reopenJob.bind(null, id)}><button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-canvas"><Icon name="undo" className="size-4" />Reopen</button></form>
              )}
              {canDelete && menuLink(`${base}?delete=1${tab !== "overview" ? `&tab=${tab}` : ""}`, <><Icon name="trash" className="size-4" />Delete visit</>, { danger: true, testid: "delete-button" })}
            </ActionMenu>
          )}
        </>}
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {ok && <Banner tone="ok"><Icon name="check" />{ok}</Banner>}
        {error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}
        {job.kind !== "install" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13.5px] text-amber-900" data-testid="warranty-banner">
            <Icon name={job.kind === "warranty" ? "shield" : "wrench"} className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
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

      {job.status !== "cancelled" && <Stepper steps={steps} />}
      <ProfileTabs base={base} current={tab} tabs={[
        { id: "overview", label: "Overview" },
        { id: "photos", label: "Photos", count: photoCount },
        { id: "notes", label: "Field notes", count: notes.length },
      ]} />

      {tab === "overview" && (
        <div className={`grid items-start gap-4 ${staff ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,20rem)]" : ""}`}>
          <div className="flex min-w-0 flex-col gap-4">
            {(mine || staff) && job.status === "scheduled" && (
              <form action={startJob.bind(null, id)}><SubmitButton className="btn btn-accent w-full py-3 text-base" pendingText="Starting…"><Icon name="play" />Start job</SubmitButton></form>
            )}

            {canWork && requirements.length > 0 && (
              <div className="card border-amber-300" data-testid="completion">
                <div className="card-hd"><h3 className="font-semibold">Required photos</h3><span className="text-xs text-muted">{reqDone} of {requirements.length} done</span></div>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex gap-1">
                    {requirements.map((r) => {
                      const okp = done.some((p) => p.requirement_id === r.id);
                      return <div key={r.id} className={`h-2 flex-1 rounded-full ${okp ? "bg-green-500" : "bg-slate-200"}`} title={r.label} />;
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

            <div className="card min-w-0">
              <div className="card-hd"><h3 className="font-semibold">Scope of work</h3>{project && <TypeTag type={project.type} />}</div>
              <ScopeTable items={parseScopeItems(project?.scope ?? "")} empty="No scope written." />
              {job.instructions && <div className="border-t border-line bg-accent-50/50 p-4 text-sm"><div className="mb-1 text-xs font-bold tracking-wide text-amber-800 uppercase">Visit instructions</div><div className="whitespace-pre-wrap">{job.instructions}</div></div>}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <RailCard title="Customer & site">
              <div className="flex flex-col gap-2 p-4 text-sm">
                <div className="font-semibold break-words">{job.customer_name}</div>
                {contact && <div className="text-muted">{contact.name}{contact.title ? `, ${contact.title}` : ""}</div>}
                <div className="text-muted">{fmtDay(dayKey(job.starts_at), { weekday: "long", month: "long", day: "numeric" })} · {fmtRange(job.starts_at, job.ends_at)}</div>
                {addr && <div className="break-words text-muted">{addr}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {dirs && <a href={dirs} target="_blank" rel="noopener" className="btn btn-sm btn-primary"><Icon name="nav" />Directions</a>}
                  {addr && <a href={mapsSearchUrl(addr)} target="_blank" rel="noopener" className="btn btn-sm"><Icon name="pin" />Open in Maps</a>}
                  {contact?.phone && <a href={telHref(contact.phone)} className="btn btn-sm"><Icon name="phone" />Call</a>}
                  {contact?.phone && <a href={smsHref(contact.phone)} className="btn btn-sm"><Icon name="text" />Text</a>}
                </div>
              </div>
            </RailCard>
            <RailCard title="Crew">
              <div className="flex flex-col gap-2 p-4">
                {job.assignees.length === 0 && <div className="text-sm text-muted">Unassigned</div>}
                {job.assignees.map((a) => (
                  <div key={a.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                    <Avatar name={a.full_name} color={a.color} src={a.avatar_url} />
                    <span className="min-w-0 truncate font-medium">{a.full_name}</span>
                  </div>
                ))}
              </div>
            </RailCard>
            {hasFleetAccess(user) && <AssignedTruckCard jobId={job.id} assigneeIds={job.assignees.map((a) => a.id)} />}
          </div>
        </div>
      )}

      {tab === "photos" && (
        <div className="flex min-w-0 flex-col gap-4" data-testid="visit-photos">
          <div className="card min-w-0" data-testid="visit-photos-before">
            <div className="card-hd"><h3 className="font-semibold">Before</h3><span className="text-xs text-muted">{before.length}</span></div>
            <div className="flex flex-col gap-3 p-4">
              {canUploadPhotos && <PhotoUploader projectId={job.project_id} jobId={id} phase="before" kind="before" label="Take a before photo" />}
              <PhotoGrid photos={before} canDelete={canManagePhotos} canMove={canManagePhotos} jobId={id} projectId={job.project_id} empty={canUploadPhotos ? "No before photos on this visit yet. Take one from your phone camera or gallery." : job.status === "scheduled" ? "Start the job to add before photos." : "No before photos on this visit."} />
              {projectBefores.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted">Also on this project</div>
                  <PhotoGrid photos={projectBefores} canDelete={staff} projectId={job.project_id} />
                </div>
              )}
            </div>
          </div>
          <div className="card min-w-0" data-testid="visit-photos-after">
            <div className="card-hd"><h3 className="font-semibold">After</h3><span className="text-xs text-muted">{phases.after.length}</span></div>
            <div className="flex flex-col gap-3 p-4">
              {canUploadPhotos && <PhotoUploader projectId={job.project_id} jobId={id} phase="after" kind="completion" label="Take an after photo" />}
              <PhotoGrid photos={phases.after} canDelete={canManagePhotos} canMove={canManagePhotos} jobId={id} projectId={job.project_id} empty={canUploadPhotos ? "No after photos on this visit yet." : job.status === "scheduled" ? "Start the job to add after photos." : "No after photos on this visit."} />
            </div>
          </div>
          <div className="card min-w-0" data-testid="visit-photos-required">
            <div className="card-hd"><h3 className="font-semibold">Required photos</h3><span className="text-xs text-muted">{requirements.length ? `${reqDone} of ${requirements.length} done` : "None"}</span></div>
            <div className="p-4">
              {requirements.length > 0
                ? <RequiredPhotoSlots jobId={id} projectId={job.project_id} requirements={requirements} photos={visitPhotos} canEdit={canUploadPhotos} canDelete={canManagePhotos} />
                : <div className="text-sm text-muted">No required-photo checklist on this project. {job.kind !== "install" ? "Warranty and service visits just need an after photo and a note." : "Managers can add required items on the project."}</div>}
            </div>
          </div>
          {phases.other.length > 0 && (
            <div className="card min-w-0" data-testid="visit-photos-other">
              <div className="card-hd"><h3 className="font-semibold">Uncategorized</h3><span className="text-xs text-muted">{phases.other.length} · imported or unfiled</span></div>
              <div className="p-4">
                <p className="mb-3 text-sm text-muted">These photos were imported (for example from Housecall Pro) or have no Before/After category yet. Move one into Before or After so it stays with the visit.</p>
                <PhotoGrid photos={phases.other} canDelete={canManagePhotos} canMove={canManagePhotos} jobId={id} projectId={job.project_id} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Notes</h3><span className="text-xs text-muted">{notes.length}</span></div>
          <ol className="divide-y divide-line">
            {notes.length === 0 && <li className="p-4 text-center text-sm text-muted">No notes yet.</li>}
            {notes.map((n) => <li key={n.id} className="flex gap-2.5 px-4 py-3 text-sm"><Avatar name={n.author_name} color={n.author_color} size="sm" /><div className="min-w-0 flex-1"><div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div><div className="whitespace-pre-wrap">{n.body}</div></div></li>)}
          </ol>
          {(canWork || ((mine || staff) && job.status !== "cancelled")) && (
            <form action={addJobNote.bind(null, id)} className="flex gap-2 border-t border-line p-3">
              <input name="body" required className="input min-w-0 flex-1" placeholder="Add a note…" aria-label="Note" /><SubmitButton className="btn shrink-0">Add</SubmitButton>
            </form>
          )}
        </div>
      )}

      {canDelete && sp.delete === "1" && (
        <DeleteConfirmDialog
          title="Delete visit"
          itemName={job.title}
          cancelHref={`/jobs/${id}`}
          action={deleteVisitAction.bind(null, id)}
          consequences={[
            "Only this visit is removed. The project and other visits stay.",
            visitPhotos.length
              ? `${countLabel(visitPhotos.length, "photo", "photos")} from this visit (files are removed from storage)`
              : "No photos are attached to this visit",
            "Notes and assignments for this visit are removed",
            "If this visit is linked to a service request, the ticket stays (the job link is cleared)",
          ]}
          confirmLabel="Delete visit"
        />
      )}
    </>
  );
}
