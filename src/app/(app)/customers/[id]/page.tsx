import type { Metadata } from "next";
import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { customerDeleteBlockers, hasDeleteAccess } from "@/lib/delete-access";
import { DeleteConfirmDialog } from "@/components/delete-confirm";
import { deleteCustomerAction } from "@/app/(app)/delete-actions";
import { getRepo } from "@/lib/data/repo";
import { addContact, addCustomerNote, deleteContact, setCustomerTags } from "../actions";
import { MessageLog } from "@/components/messages";
import { PhotoGrid } from "@/components/photos";
import { JobStatusPill, ProjectStatusPill } from "@/components/status";
import { fmtDateTime, fmtDay, fmtWhen, money, dayKey } from "@/lib/time";
import { deriveCustomerActivity } from "@/lib/activity";
import { customerProjectStats } from "@/lib/customer-project-stats";
import { liveVisitsForProject } from "@/lib/my-jobs";
import {
  ActionMenu, CommunicateMenu, ProfileHeader, ProfileTabs, RailCard, StatsStrip,
  formatStreetAddress, mapsSearchUrl, menuLink, telHref, smsHref,
} from "@/components/profile-chrome";

export async function generateMetadata({ params }: PageProps<"/customers/[id]">): Promise<Metadata> {
  const c = await (await getRepo()).getCustomer((await params).id).catch(() => null);
  return { title: c?.name ?? "Customer" };
}

function sinceDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

const TABS = ["overview", "projects", "communications", "attachments", "activity", "notes"] as const;
type Tab = (typeof TABS)[number];
/** Bookmarks of ?tab=jobs still open the Projects tab (renamed when Jobs started meaning visits). */
const tabFromParam = (raw: unknown): Tab => {
  if (raw === "jobs") return "projects";
  return TABS.includes(raw as Tab) ? (raw as Tab) : "overview";
};

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const user = await requireRole("admin", "manager");
  const canDelete = hasDeleteAccess(user);
  const { id } = await params;
  const sp = await searchParams;
  const saved = sp.saved;
  const error = typeof sp.error === "string" ? sp.error : null;
  const tab = tabFromParam(sp.tab);
  const repo = await getRepo();
  const [c, contacts, projects, messages, privateNotes, dependents] = await Promise.all([
    repo.getCustomer(id), repo.listContacts(id), repo.listProjects({ customerId: id }), repo.listMessages({ customerId: id }),
    repo.listNotes({ customerId: id }),
    canDelete ? repo.countCustomerDependents(id) : Promise.resolve({ projects: 0, serviceRequests: 0 }),
  ]);
  if (!c) notFound();
  const [allJobs, taskPage] = await Promise.all([
    // Scope to this customer — unscoped listJobs({}) is capped at 1,000 rows by PostgREST and drops later visits.
    repo.listJobs({ customerId: id }),
    repo.pageTasks({ customerId: id, tab: "all", page: 1, size: 25 }).catch(() => null),
  ]);
  const visits = allJobs.filter((j) => j.customer_id === id);
  // Customer -> Projects -> Visits. Stats and the Projects tab count projects, not visits.
  const { total: liveProjectCount, completed: completedProjectCount } = customerProjectStats(projects);
  // listPhotos({ projectId }) returns every photo on the project, including visit shots (job_id set) and project-level files (job_id null).
  const photos = (await Promise.all(projects.map((p) => repo.listPhotos({ projectId: p.id })))).flat();
  const fieldNotes = (await Promise.all(projects.map((p) => repo.listNotes({ projectId: p.id })))).flat();
  const primary = contacts.find((x) => x.is_primary) ?? contacts[0];
  const addr = formatStreetAddress(c);
  const phone = primary?.phone ?? c.phone;
  const email = primary?.email ?? c.email;
  const activity = deriveCustomerActivity({
    customerId: c.id,
    createdAt: c.created_at,
    projects: projects.map((p) => ({ id: p.id, name: p.name, created_at: p.created_at })),
    notes: [...privateNotes, ...fieldNotes],
    messages,
    photos,
    visits: visits.map((v) => ({ id: v.id, title: v.title, starts_at: v.starts_at, status: v.status, project_id: v.project_id })),
  });
  const tasks = taskPage?.items ?? [];
  const base = `/customers/${c.id}`;

  return (
    <>
      <ProfileHeader
        back={{ href: "/customers", label: "All customers" }}
        eyebrow="Customer profile"
        name={c.name}
        title={c.name}
        sub={<>{primary ? `${primary.name}${primary.title ? `, ${primary.title}` : ""}` : "No contact yet"} · Customer since {sinceDate(c.created_at)}</>}
        actions={<>
          <PendingLink href={`/customers/${c.id}/edit`} className="btn"><Icon name="edit" />Edit customer</PendingLink>
          <CommunicateMenu email={email} phone={phone} />
          {canDelete && (
            <ActionMenu>
              {menuLink(`${base}?delete=1${tab !== "overview" ? `&tab=${tab}` : ""}`, <><Icon name="trash" className="size-4" />Delete customer</>, { danger: true, testid: "delete-button" })}
            </ActionMenu>
          )}
        </>}
      />
      {(saved || error) && <div className="mb-4">{saved && <Banner tone="ok"><Icon name="check" />Customer saved.</Banner>}{error && <Banner tone="error"><Icon name="alert" />{error}</Banner>}</div>}
      <StatsStrip items={[
        { label: "Total projects", value: liveProjectCount },
        { label: "Completed projects", value: completedProjectCount },
        { label: "Attachments", value: photos.length },
        { label: "Private notes", value: privateNotes.length + (c.notes ? 1 : 0) },
      ]} />
      <ProfileTabs base={base} current={tab} tabs={[
        { id: "overview", label: "Overview" },
        { id: "projects", label: "Projects", count: liveProjectCount },
        { id: "communications", label: "Communications", count: messages.length || undefined },
        { id: "attachments", label: "Attachments", count: photos.length },
        { id: "activity", label: "Activity" },
        { id: "notes", label: "Private notes", count: privateNotes.length + (c.notes ? 1 : 0) },
      ]} />

      {tab === "overview" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,20rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="card min-w-0">
              <div className="card-hd">
                <h3 className="font-semibold">Contact information</h3>
                <Link href={`/customers/${c.id}/edit`} className="text-xs font-semibold text-brand">Edit details</Link>
              </div>
              <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Primary contact</dt>
                  <dd className="font-medium">{primary ? `${primary.name}${primary.title ? ` · ${primary.title}` : ""}` : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Customer / company</dt>
                  <dd className="font-medium break-words">{c.name}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Email</dt>
                  <dd className="truncate">{email ? <a className="font-semibold text-brand" href={`mailto:${email}`}>{email}</a> : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Phone</dt>
                  <dd>{phone ? <a className="font-semibold text-brand" href={telHref(phone)}>{phone}</a> : "—"}</dd>
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-xs text-muted">Street address</dt>
                  <dd className="break-words">{addr || "—"}</dd>
                  {addr && <a className="text-xs font-semibold text-brand" target="_blank" rel="noopener" href={mapsSearchUrl(addr)}>Open in Maps</a>}
                </div>
              </dl>
            </div>
            <div className="card min-w-0">
              <div className="card-hd"><h3 className="font-semibold">Recent activity</h3><Link href={`${base}?tab=activity`} className="text-xs font-semibold text-brand">View all</Link></div>
              <ActivityList events={activity.slice(0, 6)} />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <RailCard title="Quick contact">
              <div className="flex flex-col gap-2 p-4">
                {email ? <a href={`mailto:${email}`} className="btn w-full justify-start"><Icon name="mail" />Email</a> : <div className="text-sm text-muted">No email on file.</div>}
                {phone ? <a href={telHref(phone)} className="btn w-full justify-start"><Icon name="phone" />Call</a> : <div className="text-sm text-muted">No phone on file.</div>}
                {phone ? <a href={smsHref(phone)} className="btn w-full justify-start"><Icon name="text" />Text</a> : null}
              </div>
            </RailCard>
            <RailCard title="Customer tags">
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {c.tags.length === 0 && <div className="text-sm text-muted">No tags yet.</div>}
                  {c.tags.map((t) => (
                    <form key={t} action={setCustomerTags.bind(null, c.id)} className="tag inline-flex items-center gap-1">
                      <input type="hidden" name="remove" value={t} />
                      <span>{t}</span>
                      <button type="submit" className="text-muted hover:text-ink" aria-label={`Remove tag ${t}`}>×</button>
                    </form>
                  ))}
                </div>
                <form action={setCustomerTags.bind(null, c.id)} className="flex gap-2">
                  <input name="tag" required className="input min-w-0 flex-1" placeholder="Add a tag" aria-label="New tag" />
                  <SubmitButton className="btn btn-sm shrink-0">Add</SubmitButton>
                </form>
              </div>
            </RailCard>
            <RailCard title="Customer details" action={<Link href={`/projects/new?customer=${c.id}`} className="text-xs font-semibold text-brand">Create a project</Link>}>
              <dl className="grid gap-3 p-4 text-sm">
                <div><dt className="text-xs text-muted">Created</dt><dd>{sinceDate(c.created_at)}</dd></div>
                <div><dt className="text-xs text-muted">Projects</dt><dd>{liveProjectCount}</dd></div>
              </dl>
            </RailCard>
          </div>
        </div>
      )}

      {tab === "projects" && (
        <div className="card min-w-0">
          <div className="card-hd">
            <h3 className="font-semibold">Projects</h3>
            <PendingLink href={`/projects/new?customer=${c.id}`} className="btn btn-sm"><Icon name="plus" />New project</PendingLink>
          </div>
          {projects.length === 0 && <div className="p-6 text-center text-sm text-muted">No projects yet. <Link href={`/projects/new?customer=${c.id}`} className="font-semibold text-brand">Create a project</Link> to schedule visits.</div>}
          <div className="divide-y divide-line">
            {projects.map((p) => {
              const pVisits = liveVisitsForProject(visits, p.id);
              return (
                <div key={p.id} className="px-4 py-3 sm:px-5">
                  <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-3 hover:text-brand">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="text-[12.5px] text-muted">{money(p.value)} · {money(p.est_rebate)} rebate · {pVisits.length} visit{pVisits.length === 1 ? "" : "s"}{p.next_visit ? ` · next ${fmtWhen(p.next_visit)}` : ""}</div>
                    </div>
                    <ProjectStatusPill status={p.status} />
                  </Link>
                  {pVisits.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {pVisits.map((j) => (
                        <li key={j.id}>
                          <Link href={`/jobs/${j.id}`} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#fafbf9]">
                            <span className="w-24 shrink-0 text-[12px] text-muted">{fmtDay(dayKey(j.starts_at))}</span>
                            <span className="min-w-0 flex-1 truncate">{j.title}</span>
                            <JobStatusPill status={j.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "communications" && (
        <div className="flex min-w-0 flex-col gap-4">
          <MessageLog messages={messages} customerId={c.id} />
          <div className="card min-w-0">
            <div className="card-hd"><h3 className="font-semibold">Related tasks</h3><span className="text-xs text-muted">Task notification emails are not stored in this log</span></div>
            {tasks.length === 0 ? (
              <div className="p-5 text-sm text-muted">No logged messages beyond the communication log above, and no tasks are linked to this customer. Automated task emails are sent to assignees but are not recorded here.</div>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafbf9]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{t.title}</div>
                        <div className="text-xs text-muted">Task · {t.status.replace("_", " ")}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "attachments" && (
        <div className="card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Attachments</h3><span className="text-xs text-muted">{photos.length} photo{photos.length === 1 ? "" : "s"} from projects and visits</span></div>
          <div className="flex flex-col gap-4 p-4">
            {photos.length === 0 && <div className="text-sm text-muted">No photos or files on this customer yet. Before and completion photos are added on each project and visit.</div>}
            {projects.map((p) => {
              const list = photos.filter((ph) => ph.project_id === p.id);
              if (!list.length) return null;
              return (
                <section key={p.id} className="flex flex-col gap-2">
                  <Link href={`/projects/${p.id}?tab=files`} className="text-sm font-semibold text-brand">{p.name}</Link>
                  <PhotoGrid photos={list} empty="No photos." />
                </section>
              );
            })}
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Activity</h3><span className="text-xs text-muted">Derived from real records</span></div>
          <ActivityList events={activity} />
        </div>
      )}

      {tab === "notes" && (
        <div className="card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Private notes</h3><span className="text-xs text-muted">Staff only</span></div>
          <ol className="divide-y divide-line">
            {c.notes && (
              <li className="px-5 py-3 text-sm">
                <div className="text-xs text-muted">Profile note (from the customer record)</div>
                <div className="mt-1 whitespace-pre-wrap">{c.notes}</div>
              </li>
            )}
            {privateNotes.map((n) => (
              <li key={n.id} className="flex gap-2.5 px-5 py-3 text-sm">
                <Avatar name={n.author_name} color={n.author_color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div>
                  <div className="whitespace-pre-wrap">{n.body}</div>
                </div>
              </li>
            ))}
            {privateNotes.length === 0 && !c.notes && <li className="p-6 text-center text-sm text-muted">No private notes yet.</li>}
          </ol>
          <form action={addCustomerNote.bind(null, c.id)} className="flex flex-col gap-2 border-t border-line p-4">
            <textarea name="body" required className="input min-h-20" placeholder="Add a private note…" aria-label="Private note" />
            <SubmitButton className="btn self-start"><Icon name="note" />Add note</SubmitButton>
          </form>
        </div>
      )}

      {tab === "overview" && (
        <div className="mt-4 card min-w-0">
          <div className="card-hd"><h3 className="font-semibold">Contacts</h3><span className="text-xs text-muted">{contacts.length}</span></div>
          <div className="divide-y divide-line">
            {contacts.map((k) => (
              <div key={k.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{k.name}{k.is_primary && <span className="pill bg-brand-50 text-brand">Primary</span>}</div>
                  <div className="text-xs text-muted">{k.title ?? ""}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">{k.phone && <a className="font-semibold text-brand" href={telHref(k.phone)}>{k.phone}</a>}{k.email && <a className="font-semibold text-brand" href={`mailto:${k.email}`}>{k.email}</a>}</div>
                </div>
                <form action={deleteContact.bind(null, c.id, k.id)}><button className="btn btn-sm btn-danger" aria-label={`Remove ${k.name}`}><Icon name="trash" className="size-4" /></button></form>
              </div>
            ))}
            {contacts.length === 0 && <div className="px-5 py-4 text-sm text-muted">No contacts yet.</div>}
          </div>
          <form action={addContact.bind(null, c.id)} className="grid gap-2 border-t border-line p-5">
            <div className="text-sm font-semibold">Add contact</div>
            <input className="input" name="name" placeholder="Name" required />
            <div className="grid grid-cols-2 gap-2"><input className="input" name="title" placeholder="Title" /><input className="input" name="phone" placeholder="Phone" type="tel" /></div>
            <input className="input" name="email" placeholder="Email" type="email" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_primary" className="accent-brand" />Primary contact</label>
            <SubmitButton className="btn btn-sm" pendingText="Adding…"><Icon name="plus" className="size-4" />Add contact</SubmitButton>
          </form>
        </div>
      )}

      {canDelete && sp.delete === "1" && (
        <DeleteConfirmDialog
          title="Delete customer"
          itemName={c.name}
          cancelHref={base}
          action={deleteCustomerAction.bind(null, c.id)}
          blocked={customerDeleteBlockers(dependents)}
          consequences={[
            "Contacts and notes for this customer",
            "Messages to and from this customer",
          ]}
          confirmLabel="Delete customer"
        />
      )}
    </>
  );
}

function ActivityList({ events }: { events: ReturnType<typeof deriveCustomerActivity> }) {
  if (events.length === 0) return <div className="p-6 text-center text-sm text-muted">No activity yet.</div>;
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.id} className="flex min-w-0 flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-start sm:gap-3">
          <div className="w-36 shrink-0 text-xs text-muted">{fmtDateTime(e.at)}</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{e.title}</div>
            {e.detail && <div className="text-muted break-words">{e.detail}</div>}
            {e.href && e.hrefLabel && <Link href={e.href} className="text-xs font-semibold text-brand">{e.hrefLabel}</Link>}
          </div>
        </li>
      ))}
    </ol>
  );
}
