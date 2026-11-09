import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { JobStatusPill, ProjectStatusPill, TypeTag } from "@/components/status";
import { PhotoGrid, PhotoUploader } from "@/components/photos";
import { MessageLog } from "@/components/messages";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { fmtDateTime, fmtRange, fmtDay, dayKey, money, todayKey } from "@/lib/time";
import type { Person } from "@/lib/types";
import { addMilestone, deleteMilestone, markTimelineApproved, sendTimeline, setProjectStatus, toggleMilestone, updateMilestone } from "../actions";
import { MilestoneRow } from "./milestone-row";
import { PhotoRequirementsEditor } from "@/components/photo-requirements-editor";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const p = await (await getRepo()).getProject((await params).id).catch(() => null);
  return { title: p?.name ?? "Project" };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const p = await repo.getProject(id);
  if (!p) notFound();
  const [c, contacts, milestones, jobs, photos, messages, notes, requirements] = await Promise.all([
    repo.getCustomer(p.customer_id), repo.listContacts(p.customer_id), repo.listMilestones(id), repo.listJobs({ projectId: id }),
    repo.listPhotos({ projectId: id, kind: "before" }), repo.listMessages({ projectId: id }), repo.listNotes({ projectId: id }),
    repo.listPhotoRequirements(id),
  ]);
  const team = new Map<string, Person & { visits: number }>();
  for (const j of jobs) if (j.status !== "cancelled") for (const a of j.assignees) team.set(a.id, { ...a, visits: (team.get(a.id)?.visits ?? 0) + 1 });
  const T = todayKey();
  const contact = contacts.find((k) => k.is_primary) ?? contacts[0];
  const addr = c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";
  const ok = typeof sp.ok === "string" ? sp.ok : sp.saved ? "Project saved." : null;
  return (
    <>
      <PageHeader back={{ href: "/projects", label: "Projects" }}
        title={<span className="flex flex-wrap items-center gap-2">{p.name}<ProjectStatusPill status={p.status} /></span>}
        sub={<><Link href={`/customers/${p.customer_id}`} className="font-semibold text-brand">{c?.name}</Link> · <TypeTag type={p.type} /></>}
        actions={<>
          <Link href={`/jobs/new?project=${p.id}`} className="btn btn-primary"><Icon name="plus" />Schedule visit</Link>
          <Link href={`/projects/${p.id}/edit`} className="btn"><Icon name="edit" />Edit</Link>
          {p.status === "cancelled"
            ? <form action={setProjectStatus.bind(null, p.id, "proposed")}><SubmitButton className="btn"><Icon name="undo" />Reopen</SubmitButton></form>
            : <form action={setProjectStatus.bind(null, p.id, "cancelled")}><SubmitButton className="btn btn-danger">Cancel project</SubmitButton></form>}
        </>} />
      {ok && <div className="mb-4"><Banner tone="ok"><Icon name="check" />{ok}</Banner></div>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Scope of work</h3><span className="text-xs text-muted">Visible to assigned techs</span></div>
            <div className="whitespace-pre-wrap p-5 text-sm leading-relaxed">{p.scope || <span className="text-muted">No scope written yet. <Link className="font-semibold text-brand" href={`/projects/${p.id}/edit`}>Add scope</Link></span>}</div>
          </div>

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
                <MilestoneRow key={m.id} m={m} overdue={!m.done && !!m.due_date && m.due_date < T}
                  toggle={toggleMilestone.bind(null, p.id, m.id, !m.done)} update={updateMilestone.bind(null, p.id, m.id)} remove={deleteMilestone.bind(null, p.id, m.id)} />
              ))}
            </ul>
            <form action={addMilestone.bind(null, p.id)} className="flex flex-wrap gap-2 border-t border-line p-3" data-testid="add-milestone">
              <input name="name" required className="input min-w-0 flex-1" placeholder="Add a milestone, e.g. Materials delivered" />
              <input name="due_date" type="date" className="input !w-auto" aria-label="Due date" />
              <SubmitButton className="btn"><Icon name="plus" />Add</SubmitButton>
            </form>
          </div>

          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Visits</h3><Link href={`/jobs/new?project=${p.id}`} className="btn btn-sm"><Icon name="plus" />Schedule visit</Link></div>
            <div className="divide-y divide-line">
              {jobs.length === 0 && <div className="p-6 text-center text-sm text-muted">No visits yet. Schedule the first one.</div>}
              {jobs.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-[#fafbf9]">
                  <div className="w-24 text-[12.5px]"><div className="font-semibold">{fmtDay(dayKey(j.starts_at))}</div><div className="text-muted">{fmtRange(j.starts_at, j.ends_at)}</div></div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{j.title}</div><div className="truncate text-xs text-muted">{j.assignees.map((a) => a.full_name).join(", ") || "Unassigned"}</div></div>
                  <JobStatusPill status={j.status} />
                </Link>
              ))}
            </div>
          </div>

          <PhotoRequirementsEditor projectId={p.id} items={requirements} />

                    <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Before photos</h3><span className="text-xs text-muted">{photos.length} · techs on this project can see them</span></div>
            <div className="flex flex-col gap-3 p-4">
              <PhotoUploader projectId={p.id} kind="before" label="Add before photos" />
              <PhotoGrid photos={photos} canDelete empty="No before photos yet. Snap the existing fixtures, panels and equipment." />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="card p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-xs text-muted">Project value</div><div className="text-lg font-bold">{money(p.value)}</div></div>
              <div><div className="text-xs text-muted">Est. rebate</div><div className="text-lg font-bold text-brand">{money(p.est_rebate)}</div></div>
              <div><div className="text-xs text-muted">Customer net</div><div className="text-lg font-bold">{money(Math.max(0, p.value - p.est_rebate))}</div></div>
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Assigned team</h3><span className="text-xs text-muted">from scheduled visits</span></div>
            <div className="flex flex-col gap-2 p-4">
              {team.size === 0 && <div className="text-sm text-muted">Nobody yet. Assign techs when you schedule a visit.</div>}
              {[...team.values()].map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 text-sm"><Avatar name={a.full_name} color={a.color} /><span className="flex-1 font-medium">{a.full_name}</span><span className="text-xs text-muted">{a.visits} visit{a.visits > 1 ? "s" : ""}</span></div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><h3 className="font-semibold">Customer</h3><Link href={`/customers/${p.customer_id}`} className="text-xs font-semibold text-brand">Open</Link></div>
            <div className="flex flex-col gap-2 p-4 text-sm">
              <div className="font-semibold">{c?.name}</div>
              {contact && <div className="text-muted">{contact.name}{contact.title ? `, ${contact.title}` : ""}</div>}
              {addr && <a className="text-brand" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}>{addr}</a>}
              <div className="flex flex-wrap gap-2 pt-1">
                {(contact?.phone ?? c?.phone) && <a className="btn btn-sm" href={`tel:${(contact?.phone ?? c!.phone)!.replace(/[^\d+]/g, "")}`}><Icon name="phone" />Call</a>}
                {(contact?.phone ?? c?.phone) && <a className="btn btn-sm" href={`sms:${(contact?.phone ?? c!.phone)!.replace(/[^\d+]/g, "")}`}><Icon name="text" />Text</a>}
                {(contact?.email ?? c?.email) && <a className="btn btn-sm" href={`mailto:${contact?.email ?? c!.email}`}><Icon name="mail" />Email</a>}
              </div>
            </div>
          </div>
          {notes.length > 0 && (
            <div className="card">
              <div className="card-hd"><h3 className="font-semibold">Field notes</h3><span className="text-xs text-muted">{notes.length}</span></div>
              <ol className="divide-y divide-line">
                {notes.map((n) => <li key={n.id} className="px-4 py-3 text-sm"><div className="text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</div><div className="whitespace-pre-wrap">{n.body}</div></li>)}
              </ol>
            </div>
          )}
          <MessageLog messages={messages} customerId={p.customer_id} projectId={p.id} />
        </div>
      </div>
    </>
  );
}
