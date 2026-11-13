import type { Metadata } from "next";
import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner } from "@/components/ui";
import { JobKindBadge, JobStatusPill, ProjectStatusPill, TypeTag } from "@/components/status";
import { PhotoGrid, PhotoUploader } from "@/components/photos";
import { ProjectFilePanel } from "@/components/project-files";
import { MessageLog } from "@/components/messages";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { countLabel, hasDeleteAccess, visitDeleteConsequences } from "@/lib/delete-access";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { deleteProjectAction, deleteVisitAction } from "@/app/(app)/delete-actions";
import { getRepo } from "@/lib/data/repo";
import { fmtDateTime, fmtRange, fmtDay, dayKey, money, todayKey } from "@/lib/time";
import { DEFAULT_WARRANTY_MONTHS, type Person } from "@/lib/types";
import { addMilestone, addProjectNote, deleteMilestone, markTimelineApproved, saveProjectScope, sendTimeline, setProjectStatus, toggleMilestone, updateMilestone } from "../actions";
import { MilestoneRow } from "./milestone-row";
import { ScopeEditor } from "./scope-editor";
import { PhotoRequirementsEditor } from "@/components/photo-requirements-editor";
import { parseScopeItems } from "@/lib/scope-items";
import { UpdatesPanel } from "@/components/updates/updates-panel";
import { displayMentions } from "@/lib/updates/mentions";
import { getUpdatesRepo } from "@/lib/updates/repo";
import { groupPhotosByVisitAndPhase, PHOTO_PHASE_LABEL, visitPhotoCounts } from "@/lib/photo-phase";
import { projectDates } from "@/lib/project-row";
import { projectStepper, projectWhatsNext } from "@/lib/project-progress";
import {
  ActionMenu, ProfileHeader, ProfileTabs, RailCard, ScopeTable, Stepper,
  formatStreetAddress, mapsSearchUrl, menuLink, telHref, smsHref,
} from "@/components/profile-chrome";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const p = await (await getRepo()).getProject((await params).id).catch(() => null);
  return { title: p?.name ?? "Project" };
}

const TABS = ["overview", "scope", "visits", "files", "costs", "team", "notes", "updates"] as const;
type Tab = (typeof TABS)[number];

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await requireMember();
  const canDelete = hasDeleteAccess(user);
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const p = await repo.getProject(id);
  if (!p) notFound();
  const tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const deleteVisitId = typeof sp.deleteVisit === "string" ? sp.deleteVisit : null;
  const updatesRepo = await getUpdatesRepo();
  const [c, contacts, milestones, jobs, allPhotos, messages, notes, requirements, allProjectFiles, deleteVisitReqs, updateThreads, mentionable] = await Promise.all([
    repo.getCustomer(p.customer_id), repo.listContacts(p.customer_id), repo.listMilestones(id), repo.listJobs({ projectId: id }),
    repo.listPhotos({ projectId: id }), repo.listMessages({ projectId: id }), repo.listNotes({ projectId: id }),
    repo.listPhotoRequirements(id), repo.listProjectFiles({ projectId: id }),
    deleteVisitId ? repo.listPhotoRequirements(id, deleteVisitId) : Promise.resolve([]),
    updatesRepo.listForProject(id),
    updatesRepo.mentionableUsers(),
  ]);
  const updateCount = updateThreads.reduce((n, th) => n + 1 + th.replies.length, 0);
  const completionPhotos = allPhotos.filter((ph) => ph.kind === "completion");
  const projectDocs = allProjectFiles.filter((f) => !f.job_id);
  const fileCount = allPhotos.length + allProjectFiles.length;
  const photoGroups = groupPhotosByVisitAndPhase(jobs, allPhotos);
  const reqIds = requirements.map((r) => r.id);
  const team = new Map<string, Person & { visits: number }>();
  for (const j of jobs) if (j.status !== "cancelled") for (const a of j.assignees) team.set(a.id, { ...a, visits: (team.get(a.id)?.visits ?? 0) + 1 });
  const today = todayKey();
  const contact = contacts.find((k) => k.is_primary) ?? contacts[0];
  const addr = c ? formatStreetAddress(c) : "";
  const phone = contact?.phone ?? c?.phone;
  const email = contact?.email ?? c?.email;
  const ok = typeof sp.ok === "string" ? sp.ok : sp.saved ? "Project saved." : null;
  const dates = projectDates(jobs);
  const steps = projectStepper({ status: p.status, scope: p.scope, jobs });
  const next = projectWhatsNext({ projectId: p.id, status: p.status, scope: p.scope, jobs, requirements, completionPhotos });
  const scopeItems = parseScopeItems(p.scope);
  const internalNotes = notes.filter((n) => !n.job_id);
  const fieldNotes = notes.filter((n) => n.job_id);
  const liveVisits = jobs.filter((j) => j.status !== "cancelled");
  const base = `/projects/${p.id}`;
  const deletingVisit = deleteVisitId ? jobs.find((j) => j.id === deleteVisitId) ?? null : null;

  const createdLabel = fmtDay(dayKey(p.created_at), { month: "short", day: "numeric", year: "numeric" });
  const completedLabel = dates.completed_date
    ? fmtDay(dayKey(dates.completed_date), { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <>
      <ProfileHeader
        back={{ href: "/projects", label: "All projects" }}
        title={p.name}
        afterTitle={<ProjectStatusPill status={p.status} />}
        sub={<>
          <Link href={`/customers/${p.customer_id}`} className="font-semibold text-brand">{c?.name}</Link>
          {addr ? <> · <span className="break-words">{addr}</span></> : null}
          {" · "}Created {createdLabel}
          {completedLabel ? <> · Completed {completedLabel}</> : null}
          {" · "}<TypeTag type={p.type} />
          <> · {p.warranty_months ?? DEFAULT_WARRANTY_MONTHS}-month warranty</>
        </>}
        actions={<>
          <PendingLink href={`/jobs/new?project=${p.id}`} className="btn btn-primary"><Icon name="plus" />Schedule visit</PendingLink>
          <ActionMenu>
            {menuLink(`/tasks?new=1&project_id=${p.id}&customer_id=${p.customer_id}`, <><Icon name="task" className="size-4" />Add task</>, { testid: "project-add-task" })}
            {menuLink(`/projects/${p.id}/edit`, <><Icon name="edit" className="size-4" />Edit project</>)}
            {p.status === "cancelled"
              ? <form action={setProjectStatus.bind(null, p.id, "proposed")}><button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-canvas" type="submit"><Icon name="undo" className="size-4" />Reopen</button></form>
              : <form action={setProjectStatus.bind(null, p.id, "cancelled")}><button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-canvas" type="submit">Cancel project</button></form>}
            {canDelete && menuLink(`${base}?delete=1${tab !== "overview" ? `&tab=${tab}` : ""}`, <><Icon name="trash" className="size-4" />Delete project</>, { danger: true, testid: "delete-button" })}
          </ActionMenu>
        </>}
      />
      {ok && <div className="mb-4"><Banner tone="ok"><Icon name="check" />{ok}</Banner></div>}
      <Stepper steps={steps} />
      <ProfileTabs base={base} current={tab} tabs={[
        { id: "overview", label: "Overview" },
        { id: "scope", label: "Scope & materials" },
        { id: "visits", label: "Visits", count: liveVisits.length },
        { id: "files", label: "Files & photos", count: fileCount },
        { id: "costs", label: "Costs" },
        { id: "team", label: "Team", count: team.size || undefined },
        { id: "notes", label: "Field notes", count: fieldNotes.length },
        { id: "updates", label: "Updates", count: updateCount || undefined },
      ]} />

      {tab === "overview" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,20rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="card min-w-0">
              <div className="card-hd"><h3 className="font-semibold">What&apos;s next</h3></div>
              <div className="flex flex-col gap-3 p-5">
                <div>
                  <div className="text-base font-semibold">{next.title}</div>
                  <p className="mt-1 text-sm text-muted">{next.body}</p>
                </div>
                {next.href && next.hrefLabel && <PendingLink href={next.href} className="btn btn-primary self-start">{next.hrefLabel}</PendingLink>}
                {next.extras.length > 0 && (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {next.extras.map((x) => (
                      <li key={x.label} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <span className="min-w-0 font-medium">{x.label}</span>
                        <Link href={x.href} className="shrink-0 text-xs font-semibold text-brand">{x.hrefLabel}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="card min-w-0">
              <div className="card-hd">
                <h3 className="font-semibold">Scope of work</h3>
                <Link href={`${base}?tab=scope`} className="text-xs font-semibold text-brand">Edit scope</Link>
              </div>
              <ScopeTable items={scopeItems} empty={<>No scope written yet. <Link className="font-semibold text-brand" href={`${base}?tab=scope`}>Add scope</Link></>} />
            </div>
            <div className="card min-w-0" data-testid="project-updates-preview">
              <div className="card-hd">
                <h3 className="font-semibold">Team updates</h3>
                <Link href={`${base}?tab=updates`} className="text-xs font-semibold text-brand">View all</Link>
              </div>
              <div className="flex flex-col gap-3 p-4">
                <p className="text-xs text-muted">Questions and answers from Sales stay with this project so techs and managers can keep the history. Internal only.</p>
                {updateThreads.length === 0 && <p className="text-sm text-muted">No updates yet.</p>}
                {updateThreads.slice(0, 2).map((th) => (
                  <Link key={th.id} href={`${base}?tab=updates#update-${th.id}`} className="block rounded-lg border border-line p-3 hover:border-brand">
                    <div className="text-sm font-semibold">{th.author_name}</div>
                    <p className="mt-1 line-clamp-3 text-sm text-muted">{th.deleted_at ? "This update was deleted." : displayMentions(th.body)}</p>
                    {!!th.replies.length && <div className="mt-1 text-xs font-medium text-brand">{th.replies.length} {th.replies.length === 1 ? "reply" : "replies"}</div>}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <RailCard title="Customer & site" action={<Link href={`/customers/${p.customer_id}/edit`} className="text-xs font-semibold text-brand">Edit</Link>}>
              <div className="flex flex-col gap-2 p-4 text-sm">
                <Link href={`/customers/${p.customer_id}`} className="font-semibold text-brand break-words">{c?.name}</Link>
                {contact && <div className="text-muted">{contact.name}{contact.title ? `, ${contact.title}` : ""}</div>}
                {email && <a className="truncate text-brand" href={`mailto:${email}`}>{email}</a>}
                {phone && <a className="text-brand" href={telHref(phone)}>{phone}</a>}
                {addr && <div className="break-words text-muted">{addr}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {addr && <a className="btn btn-sm" target="_blank" rel="noopener" href={mapsSearchUrl(addr)}><Icon name="pin" />Open in Maps</a>}
                  {phone && <a className="btn btn-sm" href={telHref(phone)}><Icon name="phone" />Call</a>}
                  {phone && <a className="btn btn-sm" href={smsHref(phone)}><Icon name="text" />Text</a>}
                  {email && <a className="btn btn-sm" href={`mailto:${email}`}><Icon name="mail" />Email</a>}
                </div>
              </div>
            </RailCard>
            <RailCard title="Team" action={<Link href={`${base}?tab=team`} className="text-xs font-semibold text-brand">Manage</Link>}>
              <div className="flex flex-col gap-2 p-4">
                {team.size === 0 && <div className="text-sm text-muted">Nobody yet. Assign techs when you schedule a visit.</div>}
                {[...team.values()].map((a) => (
                  <div key={a.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                    <Avatar name={a.full_name} color={a.color} src={a.avatar_url} />
                    <span className="min-w-0 flex-1 truncate font-medium">{a.full_name}</span>
                    <span className="shrink-0 text-xs text-muted">Assigned tech · {a.visits} visit{a.visits > 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </RailCard>
            <RailCard title="Internal notes" className="note-internal" action={<span className="text-[11px] font-semibold text-amber-800">Staff only</span>}>
              <InternalNotes projectId={p.id} notes={internalNotes} />
            </RailCard>
          </div>
        </div>
      )}

      {tab === "scope" && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card min-w-0">
            <div className="card-hd">
              <h3 className="font-semibold">Scope of work</h3>
              <span className="text-xs text-muted">Visible to assigned techs</span>
            </div>
            <ScopeEditor action={saveProjectScope.bind(null, p.id)} items={scopeItems} />
          </div>
          <TimelineCard p={p} milestones={milestones} today={today} />
        </div>
      )}

      {tab === "visits" && (
        <div className="min-w-0" data-testid="project-visits">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Visits</h3>
            <PendingLink href={`/jobs/new?project=${p.id}`} className="btn btn-sm"><Icon name="plus" />Schedule visit</PendingLink>
          </div>
          {jobs.length === 0 && <div className="card p-6 text-center text-sm text-muted">No visits yet. Schedule the first one.</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((j) => {
              const counts = visitPhotoCounts(allPhotos, reqIds, j.id);
              return (
                <div key={j.id} className="card min-w-0 p-4 transition hover:bg-[#fafbf9]" data-testid={`visit-card-${j.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/jobs/${j.id}?tab=photos`} className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-muted">{fmtDay(dayKey(j.starts_at))} · {fmtRange(j.starts_at, j.ends_at)}</div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{j.title}</span><JobKindBadge kind={j.kind} size="sm" /></div>
                    </Link>
                    <div className="flex shrink-0 items-start gap-1">
                      <JobStatusPill status={j.status} />
                      {canDelete && (
                        <Link
                          href={`${base}?tab=visits&deleteVisit=${j.id}`}
                          scroll={false}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-red-700 hover:bg-red-50"
                          aria-label={`Delete visit ${j.title}`}
                          data-testid={`delete-visit-${j.id}`}
                        >
                          <Icon name="trash" className="size-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                  <Link href={`/jobs/${j.id}?tab=photos`} className="mt-2 block truncate text-xs text-muted">{j.assignees.map((a) => a.full_name).join(", ") || "Unassigned"}</Link>
                  <Link href={`/jobs/${j.id}?tab=photos`} className="mt-3 flex flex-wrap gap-1.5">
                    <span className="pill bg-canvas text-muted">Before {counts.before}</span>
                    <span className="pill bg-canvas text-muted">After {counts.after}</span>
                    {counts.requiredTotal > 0 && <span className="pill bg-canvas text-muted">Required {counts.requiredDone}/{counts.requiredTotal}</span>}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "files" && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card min-w-0" data-testid="project-documents">
            <div className="card-hd">
              <h3 className="font-semibold">Project documents</h3>
              <span className="text-xs text-muted">{projectDocs.length} · visible to assigned techs</span>
            </div>
            <div className="flex min-w-0 flex-col gap-3 p-4">
              <p className="text-sm text-muted">Scope, schedules, and photos that explain the work. These stay with the project, not a single visit.</p>
              <ProjectFilePanel files={projectDocs} projectId={p.id} canUpload canDelete={canDelete} browseLabel="Add documents" />
            </div>
          </div>
          <PhotoRequirementsEditor projectId={p.id} items={requirements} />
          <div className="card" data-testid="project-completion-photos">
            <div className="card-hd">
              <h3 className="font-semibold">Files & photos</h3>
              <span className="text-xs text-muted" data-testid="project-completion-count">{fileCount} · grouped by visit</span>
            </div>
            <div className="flex flex-col gap-6 p-4">
              {fileCount === 0 && <div className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-muted">No photos yet. Add project before photos below, or capture before/after shots on each visit.</div>}
              {photoGroups.visits.map((g) => (
                <section key={g.job.id} className="flex min-w-0 flex-col gap-3" data-testid="project-completion-group">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <Link href={`/jobs/${g.job.id}?tab=photos`} className="min-w-0 truncate font-semibold text-brand">{g.job.title}</Link>
                    <JobKindBadge kind={g.job.kind} size="sm" />
                    <span className="text-xs text-muted">{fmtDay(dayKey(g.job.starts_at))} · {g.total} photo{g.total === 1 ? "" : "s"}</span>
                    <Link href={`/jobs/${g.job.id}?tab=photos`} className="ml-auto text-xs font-semibold text-brand" data-testid="project-completion-more">View visit photos</Link>
                  </div>
                  {(["before", "after", "required", "other"] as const).map((phase) => {
                    const list = g.phases[phase];
                    if (!list.length) return null;
                    return (
                      <div key={phase} className="min-w-0">
                        <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{PHOTO_PHASE_LABEL[phase]} · {list.length}</div>
                        <PhotoGrid photos={list} canDelete canMove={phase !== "required"} jobId={g.job.id} projectId={p.id} />
                      </div>
                    );
                  })}
                </section>
              ))}
              <section className="flex min-w-0 flex-col gap-3" data-testid="project-unassigned-photos">
                <div className="text-sm font-semibold">Project photos (no visit)</div>
                <p className="text-xs text-muted">Shots that are not attached to a visit, including older project before photos and imported Housecall Pro files. They stay here so nothing disappears.</p>
                <PhotoUploader projectId={p.id} kind="before" phase="before" label="Add project before photos" />
                {photoGroups.unassignedTotal === 0 && <div className="text-sm text-muted">None yet.</div>}
                {(["before", "after", "required", "other"] as const).map((phase) => {
                  const list = photoGroups.unassigned[phase];
                  if (!list.length) return null;
                  return (
                    <div key={phase} className="min-w-0">
                      <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{PHOTO_PHASE_LABEL[phase]} · {list.length}</div>
                      <PhotoGrid photos={list} canDelete projectId={p.id} />
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        </div>
      )}

      {tab === "costs" && (
        <div className="card min-w-0 p-5">
          <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
            <div><div className="text-xs text-muted">Project value</div><div className="text-lg font-bold">{money(p.value)}</div></div>
            <div><div className="text-xs text-muted">Est. rebate</div><div className="text-lg font-bold text-brand">{money(p.est_rebate)}</div></div>
            <div><div className="text-xs text-muted">Customer net</div><div className="text-lg font-bold">{money(Math.max(0, p.value - p.est_rebate))}</div></div>
          </div>
          <p className="mt-4 text-center text-sm text-muted">These are the project value and rebate estimates on file. Line-item costs are not tracked yet.</p>
          <div className="mt-3 text-center"><Link href={`/projects/${p.id}/edit`} className="text-xs font-semibold text-brand">Edit value and rebate</Link></div>
        </div>
      )}

      {tab === "team" && (
        <div className="card min-w-0">
          <div className="card-hd">
            <h3 className="font-semibold">Assigned team</h3>
            <span className="text-xs text-muted">from scheduled visits</span>
          </div>
          <div className="flex flex-col gap-2 p-4">
            {team.size === 0 && <div className="text-sm text-muted">Nobody yet. Assign techs when you <Link href={`/jobs/new?project=${p.id}`} className="font-semibold text-brand">schedule a visit</Link>.</div>}
            {[...team.values()].map((a) => (
              <div key={a.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                <Avatar name={a.full_name} color={a.color} src={a.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.full_name}</div>
                  <div className="text-xs text-muted">Assigned tech</div>
                </div>
                <span className="text-xs text-muted">{a.visits} visit{a.visits > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Field notes</h3><span className="text-xs text-muted">{fieldNotes.length}</span></div>
            <ol className="divide-y divide-line">
              {fieldNotes.length === 0 && <li className="p-6 text-center text-sm text-muted">No field notes yet. Techs add them on each visit.</li>}
              {fieldNotes.map((n) => (
                <li key={n.id} className="flex gap-2.5 px-4 py-3 text-sm">
                  <Avatar name={n.author_name} color={n.author_color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div>
                    <div className="whitespace-pre-wrap">{n.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <MessageLog messages={messages} customerId={p.customer_id} projectId={p.id} />
        </div>
      )}

      {tab === "updates" && (
        <UpdatesPanel
          dealId={updateThreads[0]?.deal_id ?? null}
          projectId={p.id}
          contextTitle={p.name}
          threads={updateThreads}
          users={mentionable}
          user={user}
          empty="No team updates on this project yet. If this project was converted from a Sales deal, imported Monday questions will appear here after the updates import."
        />
      )}

      {canDelete && deletingVisit && (
        <DeleteConfirmDialog
          title="Delete visit"
          itemName={deletingVisit.title}
          cancelHref={`${base}?tab=visits`}
          action={deleteVisitAction.bind(null, deletingVisit.id)}
          consequences={visitDeleteConsequences({
            photoCount: allPhotos.filter((ph) => ph.job_id === deletingVisit.id).length,
            fileCount: allProjectFiles.filter((f) => f.job_id === deletingVisit.id).length,
            visitRequirementCount: deleteVisitReqs.filter((r) => r.job_id === deletingVisit.id).length,
            linkedToServiceRequest: !!deletingVisit.service_request_id,
          })}
          confirmLabel="Delete visit"
        />
      )}

      {canDelete && sp.delete === "1" && (
        <DeleteConfirmDialog
          title="Delete project"
          itemName={p.name}
          cancelHref={`/projects/${p.id}`}
          action={deleteProjectAction.bind(null, p.id)}
          consequences={[
            `${countLabel(jobs.filter((j) => j.status !== "cancelled").length, "visit", "visits")} (and their assignments)`,
            `${countLabel(allPhotos.length, "photo", "photos")} (files are removed from storage)`,
            "Milestones, notes, and the required-photo checklist",
            "Service requests stay in the inbox, unlinked from this project",
            "Customer messages stay on the customer (the project link is cleared)",
          ]}
          confirmLabel="Delete project"
        />
      )}
    </>
  );
}

function InternalNotes({ projectId, notes }: { projectId: string; notes: { id: string; body: string; author_name: string; author_color: string; created_at: string }[] }) {
  return (
    <>
      <ol className="divide-y divide-amber-200/80">
        {notes.length === 0 && <li className="px-4 py-3 text-sm text-muted">No internal notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="flex gap-2.5 px-4 py-3 text-sm">
            <Avatar name={n.author_name} color={n.author_color} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div>
              <div className="whitespace-pre-wrap">{n.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <form action={addProjectNote.bind(null, projectId)} className="flex flex-col gap-2 border-t border-amber-200 p-3">
        <textarea name="body" required className="input min-h-16 bg-white" placeholder="Add an internal note…" aria-label="Internal note" />
        <SubmitButton className="btn btn-sm self-start">Add note</SubmitButton>
      </form>
    </>
  );
}

function TimelineCard({ p, milestones, today }: {
  p: { id: string; timeline_approved_at: string | null; timeline_sent_at: string | null; timeline_sent_via: string | null };
  milestones: Parameters<typeof MilestoneRow>[0]["m"][];
  today: string;
}) {
  return (
    <div className="card" id="timeline">
      <div className="card-hd">
        <h3 className="font-semibold">Proposed timeline</h3>
        <span className="text-xs text-muted">{milestones.filter((m) => m.done).length}/{milestones.length} done</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas/50 px-4 py-2.5 text-[13px]">
        {p.timeline_approved_at ? <span className="pill bg-green-100 text-green-800"><Icon name="check" className="size-3" />Approved by customer {fmtDateTime(p.timeline_approved_at)}</span>
          : p.timeline_sent_at ? <span className="pill bg-sky-100 text-sky-800"><Icon name="send" className="size-3" />Sent by {p.timeline_sent_via} {fmtDateTime(p.timeline_sent_at)} · awaiting approval</span>
          : <span className="pill bg-slate-100 text-slate-700">Not sent to customer yet</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form action={sendTimeline.bind(null, p.id)} className="flex items-center gap-1.5" data-testid="send-timeline">
            <select name="channel" className="input !w-auto !py-1.5" aria-label="Send via" defaultValue="email"><option value="email">Email</option><option value="text">Text</option></select>
            <SubmitButton className="btn btn-sm btn-primary" pendingText="Sending…"><Icon name="send" />{p.timeline_sent_at ? "Re-send" : "Send to customer"}</SubmitButton>
          </form>
          {p.timeline_sent_at && !p.timeline_approved_at && <form action={markTimelineApproved.bind(null, p.id)}><SubmitButton className="btn btn-sm"><Icon name="check" />Mark approved</SubmitButton></form>}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {milestones.map((m) => (
          <MilestoneRow key={m.id} m={m} overdue={!m.done && !!m.due_date && m.due_date < today}
            toggle={toggleMilestone.bind(null, p.id, m.id, !m.done)} update={updateMilestone.bind(null, p.id, m.id)} remove={deleteMilestone.bind(null, p.id, m.id)} />
        ))}
      </ul>
      <form action={addMilestone.bind(null, p.id)} className="flex flex-wrap gap-2 border-t border-line p-3" data-testid="add-milestone">
        <input name="name" required className="input min-w-0 flex-1" placeholder="Add a milestone, e.g. Materials delivered" />
        <input name="due_date" type="date" className="input !w-auto" aria-label="Due date" />
        <SubmitButton className="btn"><Icon name="plus" />Add</SubmitButton>
      </form>
    </div>
  );
}
