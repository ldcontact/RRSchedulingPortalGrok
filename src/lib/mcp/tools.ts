/**
 * RR Scheduler MCP, Phase 1: read-only, portal-shaped tools.
 *
 * Each tool validates input, re-checks the caller's role the way pages and server
 * actions do (admin / manager / tech), calls the same Repo the website uses (RLS as
 * the signed-in user), and returns compact JSON with links back to the portal.
 * No writes, no email/SMS, no team admin, no raw SQL. Kept free of Next.js imports
 * so it can be unit-tested with a fake Repo.
 */
import { z } from "zod";
import { findConflicts, type Repo } from "@/lib/data/repo";
import { formatAddress } from "@/lib/project-row";
import { addDays, dayKey, fmtDateTime, fmtDay, fmtRange, monthStart, todayKey, TZ, validDay, weekStart, zonedToUtc } from "@/lib/time";
import { partitionMyJobs } from "@/lib/my-jobs";
import {
  CHANNEL_LABEL, JOB_STATUS_LABEL, PAGE_SIZE, PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL, ROLE_LABEL,
  HOME_REVIEW_LIMIT, type CustomerSort, type JobStatus, type JobView, type Message, type Note, type Person, type Photo, type PhotoRequirement, type ProjectSort, type Role, type SessionUser,
} from "@/lib/types";
import { applicablePhotoRequirements } from "@/lib/photo-requirements";

export { DEFAULT_PORTAL_URL } from "@/lib/portal-url";

export type ToolContext = { user: SessionUser; repo: Repo; portal: string };
type Member = SessionUser & { role: Role };

/** A refusal or not-found the AI should see as a plain message (returned with isError). */
export class ToolError extends Error {}

const staffRoles: Role[] = ["admin", "manager"];
function requireMember(ctx: ToolContext): Member {
  if (!ctx.user.role) throw new ToolError("You're signed in, but this account isn't on the RR Scheduler team (or is inactive). Ask an admin to add you.");
  return ctx.user as Member;
}
function requireRole(ctx: ToolContext, roles: Role[], what: string): Member {
  const u = requireMember(ctx);
  if (!roles.includes(u.role)) throw new ToolError(`${what} is available to ${roles.map((r) => ROLE_LABEL[r]).join(" and ")} accounts only.`);
  return u;
}
const isStaff = (u: Member) => staffRoles.includes(u.role);

// ---------------------------------------------------------------- input pieces
const id = (what: string) => z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, `${what} must be a UUID`).describe(`${what} (UUID)`);
const day = (what: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(validDay).describe(`${what}, YYYY-MM-DD in ${TZ}`);
const page = z.number().int().min(1).max(10_000).optional().describe("Page number, 1-based (50 per page)");
const limit = (def: number, max: number) => z.number().int().min(1).max(max).optional().describe(`Max rows to return (default ${def}, max ${max})`);

/** Visit status as the portal shows it ("awaiting_review" is stored as "completed"). */
const JOB_STATUS_KEYS = ["scheduled", "in_progress", "awaiting_review", "approved", "cancelled"] as const;
type JobStatusKey = (typeof JOB_STATUS_KEYS)[number];
const toDbStatus = (s: JobStatusKey): JobStatus => (s === "awaiting_review" ? "completed" : s);
const fromDbStatus = (s: JobStatus): JobStatusKey => (s === "completed" ? "awaiting_review" : s);

/** Longest date window a visit list may cover (keeps answers small; ~8,000 visits overall). */
export const MAX_JOB_WINDOW_DAYS = 93;

// ---------------------------------------------------------------- output shaping
const link = (ctx: ToolContext, path: string) => `${ctx.portal}${path}`;
const when = (iso: string | null | undefined) => (iso ? { at: iso, local: fmtDateTime(iso) } : null);
const person = (p: Person) => ({ id: p.id, name: p.full_name });

function visit(ctx: ToolContext, j: JobView) {
  return {
    id: j.id, title: j.title, status: fromDbStatus(j.status), status_label: JOB_STATUS_LABEL[j.status],
    day: dayKey(j.starts_at), time: fmtRange(j.starts_at, j.ends_at), starts_at: j.starts_at, ends_at: j.ends_at,
    customer: j.customer_name, address: j.address, project: { id: j.project_id, name: j.project_name },
    crew: j.assignees.map(person), link: link(ctx, `/jobs/${j.id}`),
  };
}
const photoMeta = (p: Photo, reqs: PhotoRequirement[]) => ({
  id: p.id, kind: p.kind, caption: p.caption, uploaded_by: p.uploader_name, uploaded: when(p.created_at),
  job_id: p.job_id, requirement: p.requirement_id ? reqs.find((r) => r.id === p.requirement_id)?.label ?? null : null,
});
const note = (n: Note) => ({ id: n.id, body: n.body, author: n.author_name, created: when(n.created_at), job_id: n.job_id, project_id: n.project_id });
const message = (m: Message) => ({
  id: m.id, channel: m.channel, channel_label: CHANNEL_LABEL[m.channel], direction: m.direction, subject: m.subject, body: m.body,
  sent_by: m.sender_name, created: when(m.created_at), project_id: m.project_id, customer_id: m.customer_id,
});
const recent = <T>(rows: T[], n: number) => ({ total: rows.length, shown: Math.min(n, rows.length), items: rows.slice(0, n) });
const pages = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

/** Local [from, to] day window (inclusive) -> the UTC [start, end) the repo filters on. */
const windowUtc = (from: string, to: string) => ({ from: zonedToUtc(from, 0), to: zonedToUtc(addDays(to, 1), 0) });
const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);

/** Required-photo checklist progress for one visit's completion photos. */
function requiredPhotos(reqs: PhotoRequirement[], completion: Photo[]) {
  const items = reqs.map((r) => ({
    id: r.id, label: r.label, note: r.note, source: r.job_id ? "visit" as const : "project" as const,
    done: completion.some((p) => p.requirement_id === r.id),
  }));
  return { done: items.filter((i) => i.done).length, total: items.length, missing: items.filter((i) => !i.done).map((i) => i.label), items };
}

/** Techs: the visit must be visible (RLS) and assigned to them, matching the job screen. */
async function visibleJob(ctx: ToolContext, u: Member, jobId: string) {
  const job = await ctx.repo.getJob(jobId);
  if (!job || (!isStaff(u) && !job.assignees.some((a) => a.id === u.id))) throw new ToolError("Visit not found, or it isn't assigned to you.");
  return job;
}
/** Techs: the project must have at least one visit assigned to them. Returns their visible visits. */
async function visibleProject(ctx: ToolContext, u: Member, projectId: string) {
  const [project, jobs] = await Promise.all([ctx.repo.getProject(projectId), ctx.repo.listJobs({ projectId })]);
  const mine = isStaff(u) ? jobs : jobs.filter((j) => j.assignees.some((a) => a.id === u.id));
  if (!project || (!isStaff(u) && !mine.length)) throw new ToolError("Project not found, or you have no visits on it.");
  return { project, jobs: mine };
}

// ---------------------------------------------------------------- tools
type ToolDef<S extends z.ZodObject> = {
  title: string;
  description: string;
  input: S;
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>;
};
const tool = <S extends z.ZodObject>(t: ToolDef<S>) => t;

export const TOOLS = {
  get_session: tool({
    title: "Who am I",
    description: "The signed-in RR Scheduler user: name, email, and role (admin, manager, or tech). Call this first to know what you can see.",
    input: z.object({}),
    async run(ctx) {
      const u = ctx.user;
      return {
        name: u.name, email: u.email, role: u.role, role_label: u.role ? ROLE_LABEL[u.role] : null, on_team: !!u.role, active: u.active,
        can_see: !u.role ? "nothing yet (not on the team)" : staffRoles.includes(u.role) ? "all customers, projects, visits, team, notes, photos and message logs" : "only visits assigned to you, and their projects, notes and photos",
        time_zone: TZ, portal: ctx.portal,
      };
    },
  }),

  get_overview: tool({
    title: "Home overview",
    description: "The portal home screen. Staff: counts, today's visits, and visits awaiting review. Techs: My Jobs (today, coming up, sent back, recently submitted).",
    input: z.object({}),
    async run(ctx) {
      const u = requireMember(ctx);
      const T = todayKey();
      if (!isStaff(u)) {
        // Same window as My Jobs: a week back so in-progress / recently submitted still show.
        const jobs = (await ctx.repo.listJobs({ from: zonedToUtc(addDays(T, -7), 0), assignee: u.id }))
          .filter((j) => j.status !== "cancelled" && j.assignees.some((a) => a.id === u.id));
        const { today, upcoming, submitted, sentBack } = partitionMyJobs(jobs, T);
        return {
          today: T, time_zone: TZ, link: link(ctx, "/"),
          sent_back: sentBack.map((j) => ({ ...visit(ctx, j), review_note: j.review_note })),
          today_visits: today.map((j) => visit(ctx, j)),
          coming_up: upcoming.slice(0, 50).map((j) => visit(ctx, j)),
          recently_submitted: submitted.map((j) => visit(ctx, j)),
        };
      }
      const [c, review, today] = await Promise.all([
        ctx.repo.counts(), ctx.repo.listJobs({ status: ["completed"], limit: HOME_REVIEW_LIMIT, order: "completed_at" }), ctx.repo.listJobs({ from: zonedToUtc(T, 0), to: zonedToUtc(addDays(T, 1), 0) }),
      ]);
      return {
        today: T, time_zone: TZ, link: link(ctx, "/"),
        counts: {
          visits_today: c.jobsToday, awaiting_review: c.awaitingReview, active_projects: c.activeProjects, proposals_out: c.proposed,
          customers: c.customers, active_team_members: c.team, ...(u.role === "admin" ? { invites_pending: c.invited } : {}),
        },
        awaiting_review: review.map((j) => ({ ...visit(ctx, j), submitted: when(j.completed_at) })),
        today_visits: today.filter((j) => j.status !== "cancelled").map((j) => visit(ctx, j)),
        schedule_link: link(ctx, `/schedule?view=day&date=${T}`),
      };
    },
  }),

  search_customers: tool({
    title: "Search customers",
    description: "One page (50) of the Customers list. Search matches customer name or company, contact first/last name, email, address (street, city, state, zip) and phone (any format, digits-only; 4+ digits match partially). Words are matched separately. Admin and manager only.",
    input: z.object({
      query: z.string().max(100).optional().describe("Search text"),
      sort: z.enum(["newest", "name_asc", "name_desc"]).optional().describe("newest first (default), name A–Z, or name Z–A"),
      page,
    }),
    async run(ctx, a) {
      requireRole(ctx, staffRoles, "The customer list");
      const sort: CustomerSort = a.sort === "name_asc" ? "name" : a.sort === "name_desc" ? "name_desc" : "newest";
      const r = await ctx.repo.pageCustomers({ q: a.query?.trim(), page: a.page ?? 1, size: PAGE_SIZE, sort });
      const qs = new URLSearchParams({ ...(a.query ? { q: a.query } : {}), ...(sort !== "newest" ? { sort } : {}), ...(r.page > 1 ? { page: String(r.page) } : {}) }).toString();
      return {
        total: r.total, page: r.page, pages: pages(r.total, r.size), page_size: r.size, link: link(ctx, `/customers${qs ? `?${qs}` : ""}`),
        customers: r.items.map((c) => ({
          id: c.id, name: c.name, address: formatAddress(c) || null, city: c.city, contact: c.primary_contact, phone: c.phone, email: c.email, tags: c.tags,
          link: link(ctx, `/customers/${c.id}`),
        })),
      };
    },
  }),

  get_customer: tool({
    title: "Customer detail",
    description: "Full customer record: address, tags, customer notes, contacts, projects, and the message log (most recent 25; use list_messages for more). Admin and manager only.",
    input: z.object({ customer_id: id("Customer id") }),
    async run(ctx, a) {
      requireRole(ctx, staffRoles, "Customer records");
      const [c, contacts, projects, messages] = await Promise.all([
        ctx.repo.getCustomer(a.customer_id), ctx.repo.listContacts(a.customer_id), ctx.repo.listProjects({ customerId: a.customer_id }), ctx.repo.listMessages({ customerId: a.customer_id }),
      ]);
      if (!c) throw new ToolError("Customer not found.");
      return {
        id: c.id, name: c.name, phone: c.phone, email: c.email, address: formatAddress(c) || null, tags: c.tags, notes: c.notes,
        created: when(c.created_at), link: link(ctx, `/customers/${c.id}`),
        contacts: contacts.map((k) => ({ name: k.name, title: k.title, phone: k.phone, email: k.email, primary: k.is_primary })),
        projects: projects.map((p) => ({
          id: p.id, name: p.name, status: p.status, status_label: PROJECT_STATUS_LABEL[p.status], value: p.value, est_rebate: p.est_rebate,
          next_visit: when(p.next_visit), link: link(ctx, `/projects/${p.id}`),
        })),
        messages: recent(messages.map(message), 25),
      };
    },
  }),

  search_projects: tool({
    title: "Search projects",
    description: "One page (50) of the Projects list with per-status counts. Search matches project name, type label (for example LED Lighting or Pipe Insulation), HCP job number, scope, job-site address, plus the customer name, contact names, address and phone (any format). Default status is all active (everything but cancelled). Admin and manager only.",
    input: z.object({
      query: z.string().max(100).optional().describe("Search text"),
      status: z.enum(["active", ...PROJECT_STATUSES]).optional().describe("active (default) or one status"),
      sort: z.enum(["updated", "newest", "name", "value"]).optional().describe("recently updated (default), newest, name, or highest value"),
      page,
    }),
    async run(ctx, a) {
      requireRole(ctx, staffRoles, "The project list");
      const status = a.status && a.status !== "active" ? a.status : undefined;
      const sort: ProjectSort = a.sort ?? "updated";
      const r = await ctx.repo.pageProjects({ q: a.query?.trim(), status, page: a.page ?? 1, size: PAGE_SIZE, sort });
      const qs = new URLSearchParams({ ...(a.query ? { q: a.query } : {}), ...(status ? { status } : {}), ...(sort !== "updated" ? { sort } : {}), ...(r.page > 1 ? { page: String(r.page) } : {}) }).toString();
      return {
        total: r.total, page: r.page, pages: pages(r.total, r.size), page_size: r.size, counts_by_status: r.counts, ...(r.note ? { note: r.note } : {}),
        link: link(ctx, `/projects${qs ? `?${qs}` : ""}`),
        projects: r.items.map((p) => ({
          id: p.id, name: p.name, customer: p.customer_name, type: PROJECT_TYPE_LABEL[p.type], status: p.status, status_label: PROJECT_STATUS_LABEL[p.status],
          value: p.value, est_rebate: p.est_rebate, address: p.address || null,
          start_date: p.start_date ? dayKey(p.start_date) : null, completed_date: p.completed_date ? dayKey(p.completed_date) : null,
          next_visit: when(p.next_visit), team: p.team.map(person), milestones: `${p.done_milestones}/${p.total_milestones}`,
          link: link(ctx, `/projects/${p.id}`),
        })),
      };
    },
  }),

  get_project: tool({
    title: "Project detail",
    description: "Project scope, value and estimated rebate, milestones, visits, crew, required-photo checklist, before-photo metadata, notes, and (staff only) the message log. Techs only see projects they have visits on, without money or the message log.",
    input: z.object({ project_id: id("Project id") }),
    async run(ctx, a) {
      const u = requireMember(ctx);
      const staff = isStaff(u);
      const { project: p, jobs } = await visibleProject(ctx, u, a.project_id);
      const [c, contacts, milestones, before, notes, reqs, messages] = await Promise.all([
        ctx.repo.getCustomer(p.customer_id), ctx.repo.listContacts(p.customer_id), ctx.repo.listMilestones(p.id),
        ctx.repo.listPhotos({ projectId: p.id, kind: "before" }), ctx.repo.listNotes({ projectId: p.id }), ctx.repo.listPhotoRequirements(p.id),
        staff ? ctx.repo.listMessages({ projectId: p.id }) : Promise.resolve([] as Message[]),
      ]);
      const myJobIds = new Set(jobs.map((j) => j.id));
      const crew = new Map<string, { id: string; name: string; visits: number }>();
      for (const j of jobs) if (j.status !== "cancelled") for (const x of j.assignees) crew.set(x.id, { ...person(x), visits: (crew.get(x.id)?.visits ?? 0) + 1 });
      const contact = contacts.find((k) => k.is_primary) ?? contacts[0];
      return {
        id: p.id, name: p.name, type: PROJECT_TYPE_LABEL[p.type], status: p.status, status_label: PROJECT_STATUS_LABEL[p.status], scope: p.scope,
        ...(staff ? {
          value: p.value, est_rebate: p.est_rebate,
          timeline: p.timeline_approved_at ? `approved by customer ${fmtDateTime(p.timeline_approved_at)}` : p.timeline_sent_at ? `sent by ${p.timeline_sent_via} ${fmtDateTime(p.timeline_sent_at)}, awaiting approval` : "not sent to customer yet",
        } : {}),
        customer: c ? {
          id: c.id, name: c.name, address: formatAddress(c) || null,
          ...(staff ? { phone: c.phone, email: c.email, link: link(ctx, `/customers/${c.id}`) } : {}),
        } : null,
        on_site_contact: contact ? { name: contact.name, title: contact.title, phone: contact.phone } : null,
        milestones: { done: milestones.filter((m) => m.done).length, total: milestones.length, items: milestones.map((m) => ({ name: m.name, due_date: m.due_date, done: m.done })) },
        visits: jobs.map((j) => visit(ctx, j)),
        crew: [...crew.values()],
        required_photos: reqs.map((r) => ({ id: r.id, label: r.label, note: r.note })),
        before_photos: { count: before.length, items: before.map((x) => photoMeta(x, reqs)) },
        // Techs read notes only on visits assigned to them (RLS does the same).
        notes: (staff ? notes : notes.filter((n) => n.job_id && myJobIds.has(n.job_id))).map(note),
        ...(staff ? { messages: recent(messages.map(message), 25) } : {}),
        ...(staff ? { link: link(ctx, `/projects/${p.id}`) } : {}),
        time_zone: TZ,
      };
    },
  }),

  search_jobs: tool({
    title: "Search visits",
    description: `Visits (jobs) filtered by date window, project, assignee, and status. Give from+to (YYYY-MM-DD, ${TZ}, at most ${MAX_JOB_WINDOW_DAYS} days) or a project_id; there is no "all visits" list. Techs only see visits assigned to them.`,
    input: z.object({
      from: day("First day").optional(),
      to: day("Last day (inclusive)").optional(),
      project_id: id("Project id").optional(),
      assignee_id: id("Team member (profile) id").optional(),
      status: z.array(z.enum(JOB_STATUS_KEYS)).max(5).optional().describe("Any of: scheduled, in_progress, awaiting_review, approved, cancelled"),
      limit: limit(100, 200),
    }),
    async run(ctx, a) {
      const u = requireMember(ctx);
      if ((a.from && !a.to) || (!a.from && a.to)) throw new ToolError("Give both from and to (YYYY-MM-DD), or neither with a project_id.");
      if (!a.from && !a.project_id) throw new ToolError("A date window (from + to) or a project_id is required; there is no unbounded visit list.");
      if (a.from && a.to) {
        const span = daysBetween(a.from, a.to);
        if (span < 0) throw new ToolError("to must be on or after from.");
        if (span >= MAX_JOB_WINDOW_DAYS) throw new ToolError(`Date window is too long; use at most ${MAX_JOB_WINDOW_DAYS} days.`);
      }
      const rows = await ctx.repo.listJobs({
        ...(a.from && a.to ? windowUtc(a.from, a.to) : {}), projectId: a.project_id, assignee: a.assignee_id,
        status: a.status?.length ? [...new Set(a.status.map(toDbStatus))] : undefined,
      });
      const visible = isStaff(u) ? rows : rows.filter((j) => j.assignees.some((x) => x.id === u.id));
      const n = a.limit ?? 100;
      return { total: visible.length, shown: Math.min(n, visible.length), truncated: visible.length > n, time_zone: TZ, visits: visible.slice(0, n).map((j) => visit(ctx, j)) };
    },
  }),

  get_job: tool({
    title: "Visit detail",
    description: "One visit (job): time, address, on-site contact, crew, scope and instructions, review note, job notes, before and completion photo metadata, and required-photo progress (project-level items on install visits, plus any visit-specific items). Techs only see visits assigned to them.",
    input: z.object({ job_id: id("Visit (job) id") }),
    async run(ctx, a) {
      const u = requireMember(ctx);
      const j = await visibleJob(ctx, u, a.job_id);
      const [project, contacts, before, done, notes, allReqs] = await Promise.all([
        ctx.repo.getProject(j.project_id), ctx.repo.listContacts(j.customer_id),
        ctx.repo.listPhotos({ projectId: j.project_id, kind: "before" }), ctx.repo.listPhotos({ jobId: j.id, kind: "completion" }),
        ctx.repo.listNotes({ jobId: j.id }), ctx.repo.listPhotoRequirements(j.project_id, j.id),
      ]);
      const reqs = applicablePhotoRequirements(j.kind, allReqs);
      const contact = contacts.find((k) => k.is_primary) ?? contacts[0];
      return {
        ...visit(ctx, j), date: fmtDay(dayKey(j.starts_at), { weekday: "long", month: "long", day: "numeric", year: "numeric" }), time_zone: TZ,
        project_type: PROJECT_TYPE_LABEL[j.project_type],
        on_site_contact: contact ? { name: contact.name, title: contact.title, phone: contact.phone } : null,
        scope: project?.scope ?? null, instructions: j.instructions, review_note: j.review_note,
        started: when(j.started_at), submitted: when(j.completed_at), approved: when(j.approved_at),
        required_photos: requiredPhotos(reqs, done),
        before_photos: { count: before.length, items: before.map((x) => photoMeta(x, reqs)) },
        completion_photos: { count: done.length, items: done.map((x) => photoMeta(x, reqs)) },
        notes: notes.map(note),
      };
    },
  }),

  get_schedule: tool({
    title: "Schedule board",
    description: `The Schedule board for a day, week (Mon–Sun), or month (6-week grid): visits in range grouped by crew row, unassigned visits, and scheduling conflicts. Times in ${TZ}. Techs see only their own row.`,
    input: z.object({
      view: z.enum(["day", "week", "month"]).optional().describe("day, week (default), or month"),
      date: day("Any day in the period (default today)").optional(),
      tech_id: id("Only this team member's row").optional(),
    }),
    async run(ctx, a) {
      const u = requireMember(ctx);
      const staff = isStaff(u);
      const view = a.view ?? "week";
      const date = a.date ?? todayKey();
      const start = view === "day" ? date : view === "week" ? weekStart(date) : weekStart(monthStart(date));
      const days = view === "day" ? 1 : view === "week" ? 7 : 42;
      const tech = staff ? a.tech_id ?? "" : u.id;
      const [all, people] = await Promise.all([
        ctx.repo.listJobs({ from: zonedToUtc(start, 0), to: zonedToUtc(addDays(start, days), 0) }), // techs: RLS returns only their own
        ctx.repo.listAssignable(),
      ]);
      const jobs = all.filter((j) => j.status !== "cancelled" && (!tech || j.assignees.some((x) => x.id === tech)));
      // Same rule as the board: a crew member booked on two overlapping, non-cancelled visits. One entry per pair.
      const conflicts: { job_id: string; title: string; person: string; overlaps_job_id: string; overlaps_title: string }[] = [];
      const seen = new Set<string>();
      for (const j of jobs) for (const c of findConflicts(all, j.assignees.map((x) => x.id), j.starts_at, j.ends_at, j.id)) {
        const key = [j.id, c.job.id].sort().join("|") + "|" + c.person.id;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({ job_id: j.id, title: j.title, person: c.person.full_name, overlaps_job_id: c.job.id, overlaps_title: c.job.title });
      }
      const rows = (staff ? people.filter((p) => p.role === "tech" || jobs.some((j) => j.assignees.some((x) => x.id === p.id))) : people.filter((p) => p.id === u.id))
        .filter((p) => !tech || p.id === tech);
      const qs = new URLSearchParams({ view, date, ...(staff && tech ? { tech } : {}) }).toString();
      return {
        view, from: start, to: addDays(start, days - 1), time_zone: TZ, link: link(ctx, `/schedule?${qs}`), total_visits: jobs.length,
        rows: rows.map((p) => ({
          id: p.id, name: p.full_name, role: p.role,
          visits: jobs.filter((j) => j.assignees.some((x) => x.id === p.id)).map((j) => ({ id: j.id, title: j.title, day: dayKey(j.starts_at), time: fmtRange(j.starts_at, j.ends_at), status: fromDbStatus(j.status), customer: j.customer_name, link: link(ctx, `/jobs/${j.id}`) })),
        })),
        ...(staff ? { unassigned: jobs.filter((j) => !j.assignees.length).map((j) => visit(ctx, j)) } : {}),
        conflicts,
      };
    },
  }),

  list_team: tool({
    title: "Team",
    description: "Team directory: name, email, role, title, phone, and status (active, invited, or inactive). Pending invites are shown to admins only. Admin and manager only.",
    input: z.object({}),
    async run(ctx) {
      const u = requireRole(ctx, staffRoles, "The team list");
      let team = await ctx.repo.listTeam();
      if (u.role !== "admin") team = team.filter((m) => m.status !== "invited"); // matches RLS: only admins see invites
      return {
        link: link(ctx, "/team"),
        members: team.map((m) => ({ id: m.profile_id, name: m.full_name, email: m.email, role: m.role, role_label: m.role ? ROLE_LABEL[m.role] : null, title: m.title, phone: m.phone, status: m.status })),
      };
    },
  }),

  list_notes: tool({
    title: "Notes",
    description: "Notes on one visit (job_id) or one project (project_id, includes notes on its visits), oldest first. Techs only read notes on visits assigned to them.",
    input: z.object({ job_id: id("Visit (job) id").optional(), project_id: id("Project id").optional() }),
    async run(ctx, a) {
      const u = requireMember(ctx);
      if (!!a.job_id === !!a.project_id) throw new ToolError("Give exactly one of job_id or project_id.");
      if (a.job_id) {
        await visibleJob(ctx, u, a.job_id);
        return { job_id: a.job_id, notes: (await ctx.repo.listNotes({ jobId: a.job_id })).map(note), link: link(ctx, `/jobs/${a.job_id}`) };
      }
      const { jobs } = await visibleProject(ctx, u, a.project_id!);
      const mine = new Set(jobs.map((j) => j.id));
      const notes = await ctx.repo.listNotes({ projectId: a.project_id });
      return { project_id: a.project_id, notes: (isStaff(u) ? notes : notes.filter((n) => n.job_id && mine.has(n.job_id))).map(note) };
    },
  }),

  list_messages: tool({
    title: "Message log",
    description: "A customer's or project's message log (calls, texts, emails, proposed timelines, notes), newest first. Read-only: nothing is sent. Admin and manager only.",
    input: z.object({ customer_id: id("Customer id").optional(), project_id: id("Project id").optional(), limit: limit(50, 200) }),
    async run(ctx, a) {
      requireRole(ctx, staffRoles, "Message logs");
      if (!a.customer_id && !a.project_id) throw new ToolError("Give a customer_id or a project_id.");
      const rows = await ctx.repo.listMessages({ customerId: a.customer_id, projectId: a.project_id });
      return { ...recent(rows.map(message), a.limit ?? 50), link: link(ctx, a.project_id ? `/projects/${a.project_id}` : `/customers/${a.customer_id}`) };
    },
  }),

  list_photos: tool({
    title: "Photos",
    description: "Photo records for a project or visit: kind (before / completion), caption, uploader, time, required-photo label, and a short-lived signed image URL (expires in about an hour). Only photos recorded in the portal; techs only see their visits' photos and the project's before photos.",
    input: z.object({
      project_id: id("Project id").optional(), job_id: id("Visit (job) id").optional(),
      kind: z.enum(["before", "completion"]).optional(), limit: limit(100, 200),
    }),
    async run(ctx, a) {
      const u = requireMember(ctx);
      if (!a.project_id && !a.job_id) throw new ToolError("Give a project_id or a job_id.");
      let projectId = a.project_id;
      if (a.job_id) {
        const j = await visibleJob(ctx, u, a.job_id);
        if (projectId && projectId !== j.project_id) throw new ToolError("That visit belongs to a different project.");
        projectId = j.project_id;
      } else {
        await visibleProject(ctx, u, projectId!);
      }
      const [photos, reqs] = await Promise.all([ctx.repo.listPhotos({ projectId, jobId: a.job_id, kind: a.kind }), ctx.repo.listPhotoRequirements(projectId!, a.job_id)]);
      const n = a.limit ?? 100;
      return {
        total: photos.length, shown: Math.min(n, photos.length), url_expires_in_seconds: 3600,
        photos: photos.slice(0, n).map((x) => ({ ...photoMeta(x, reqs), url: x.url || null })),
      };
    },
  }),
} as const;

export type ToolName = keyof typeof TOOLS;

/** Run one tool and wrap the result (or a ToolError) as MCP text content. */
export async function callTool(name: ToolName, ctx: ToolContext, args: unknown) {
  const t = TOOLS[name] as ToolDef<z.ZodObject>;
  try {
    const parsed = t.input.safeParse(args ?? {});
    if (!parsed.success) throw new ToolError(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
    const result = await t.run(ctx, parsed.data);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : "Something went wrong reading the portal. Try again, or open the portal directly.";
    if (!(e instanceof ToolError)) console.error(`[mcp] ${name} failed:`, e instanceof Error ? e.message : "unknown error");
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}
