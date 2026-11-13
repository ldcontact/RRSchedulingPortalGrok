import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { mergeTeam, type Repo } from "./repo";
import { DEFAULT_WARRANTY_MONTHS, PAGE_SIZE, PROJECT_STATUSES, SR_OPEN, SR_STATUSES } from "@/lib/types";
import type { FleetVehicleRow, AvatarSource, Contact, Customer, CustomerListItem, CustomerRow, Job, JobView, Message, Milestone, Note, Person, Photo, PhotoRequirement, Profile, Project, ProjectFile, ProjectListItem, ProjectPick, ProjectRow, Role, ServiceRequest, ServiceRequestView, SREvent, SRPageFilter, Task, TaskCommentView, TaskView, WorkspaceSearchHit } from "@/lib/types";
import { derivePhotoPhase, kindForPhase } from "@/lib/photo-phase";
import { mimeForFile, projectFileStoragePath, sanitizeFilename, storageExtFor, validateProjectFile } from "@/lib/project-file";
import { addDays, todayKey, zonedToUtc } from "@/lib/time";
import { formatAddress, projectDates } from "@/lib/project-row";
import { avatarStorageFolder, resolveAvatarUrl } from "@/lib/avatar";
import { serviceRequestActorAvatarUrl } from "@/lib/service-request-notes";
import { authorColor, authorLabel } from "@/lib/author";
import { applySearch, parseSearch } from "@/lib/search";
import { PROJECT_HIT_LIMIT, toProjectHit } from "@/lib/project-hit";
import { customerSubtitle, emptyWorkspaceSearch, personHref, personSubtitle, projectSubtitle, WORKSPACE_SEARCH_LIMIT } from "@/lib/workspace-search";
import { applyTicketVisits } from "@/lib/tickets";
import { addressChanged, emptyGeocode, visitCoords } from "@/lib/geocode/parse";
import type { TicketVisitCrew } from "@/lib/types";
import { compareTasksByDue, taskCounts } from "@/lib/tasks";
import { TASK_ACTIVE } from "@/lib/types";
import { normalizeTeamSmsPrefs } from "@/lib/team-sms/prefs";
import { applyTeamSmsPrefs, supabaseTeamSmsStore } from "@/lib/team-sms/supabase-adapter";
import { notifyServiceRequestAssigned, notifyTaskAssigned, notifyVisitAssigneesChanged, notifyVisitCreated, notifyVisitUpdated } from "@/lib/team-sms/notify";

/** Search term safe inside a PostgREST or=() filter: quoted, without wildcard/grouping chars. */
const searchTerm = (q: string | undefined) => {
  const t = (q ?? "").replace(/[%_,()"\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return t ? `"%${t}%"` : null;
};
const pageBounds = (page: number, size: number) => {
  const p = Math.max(1, Math.floor(page) || 1), n = Math.min(Math.max(1, Math.floor(size) || PAGE_SIZE), 200);
  return { p, n, from: (p - 1) * n, to: p * n - 1 };
};
/** Only what a Projects-tab row shows (typed as string to skip deep select-type inference). */
const PROJECT_PAGE_SELECT: string = "id, name, type, status, value, est_rebate, updated_at, customers(name, address, city, state, zip), milestones(done), jobs(starts_at, ends_at, status, completed_at, kind, job_assignments(profiles(id, full_name, color, avatar_source, avatar_path, google_avatar_url)))";
/** Most customer ids the project picker search will include by customer name (keeps the URL short). */
const MAX_CUSTOMER_MATCHES = 200;
type CustomerRowRaw = Pick<Customer, "id" | "name" | "phone" | "email" | "address" | "city" | "state" | "zip" | "tags"> & { contacts: { name: string; is_primary: boolean }[] };
const mapCustomers = (data: unknown[] | null): CustomerRow[] =>
  ((data ?? []) as CustomerRowRaw[]).map(({ contacts, ...c }) => ({ ...c, primary_contact: contacts.find((x) => x.is_primary)?.name ?? contacts[0]?.name ?? null }));
const iso = (t: string | null) => (t ? new Date(t).toISOString() : t); // normalise "+00:00" -> "Z" so string compares work
function jobSnap(j: JobView) {
  const bits = (j.address ?? "").split(",");
  const city = bits.length > 1 ? bits[bits.length - 1]!.trim().replace(/\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/, "").trim() : null;
  const address = bits.length > 1 ? bits.slice(0, -1).join(",").trim() : (j.address ?? null);
  return { id: j.id, startsAt: j.starts_at, status: j.status, address, city, assigneeIds: j.assignees.map((a) => a.id) };
}
const JOB_SELECT = "*, projects!inner(name, type, customer_id, customers(name, address, city, state, zip, lat, lng, geocode_status)), service_requests!jobs_service_request_id_fkey(lat, lng, geocode_status, site_address), job_assignments(profiles(id, full_name, color, avatar_source, avatar_path, google_avatar_url))";
type JobRow = Job & {
  projects: { name: string; type: Project["type"]; customer_id: string; customers: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null; lat: number | null; lng: number | null; geocode_status: import("@/lib/types").GeocodeStatus | null } | null };
  service_requests: { lat: number | null; lng: number | null; geocode_status: import("@/lib/types").GeocodeStatus | null; site_address: string | null } | null;
  job_assignments: { profiles: Person | null }[];
};
function toJobView(r: JobRow): JobView {
  const { projects: p, job_assignments, service_requests: sr, ...j } = r;
  const c = p.customers;
  const addr = c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";
  const { latitude, longitude } = visitCoords(c, sr);
  return {
    ...j, starts_at: iso(j.starts_at)!, ends_at: iso(j.ends_at)!, project_name: p.name, project_type: p.type, customer_id: p.customer_id,
    customer_name: c?.name ?? "", address: addr || null, assignees: job_assignments.map((a) => a.profiles).filter((x): x is Person => !!x),
    latitude, longitude,
  };
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

const asInt = (v: unknown) => Number(v ?? 0);

function projectStatusCountsFromRpc(raw: unknown): Record<string, number> {
  const row = (raw ?? {}) as Record<string, unknown>;
  const counts: Record<string, number> = { active: asInt(row.active) };
  for (const st of PROJECT_STATUSES) counts[st] = asInt(row[st]);
  return counts;
}

/** One RPC per request for the two nav badges (layout + Home both call these). */
const loadNavBadges = cache(async () => {
  const { data, error } = await (await createClient()).rpc("nav_badges");
  fail(error);
  const row = (data ?? {}) as Record<string, unknown>;
  return { openServiceRequests: asInt(row.open_service_requests), myOpenTasks: asInt(row.my_open_tasks) };
});

type AvatarFields = { avatar_source?: AvatarSource | null; avatar_path?: string | null; google_avatar_url?: string | null };
async function signAvatarPaths(s: Awaited<ReturnType<typeof createClient>>, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await s.storage.from("avatars").createSignedUrls(unique, 3600);
  return new Map((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl!]));
}
async function withAvatarUrl<T extends AvatarFields>(s: Awaited<ReturnType<typeof createClient>>, row: T): Promise<T & { avatar_url: string | null }> {
  const signed = row.avatar_source === "upload" && row.avatar_path
    ? (await signAvatarPaths(s, [row.avatar_path])).get(row.avatar_path) ?? null
    : null;
  return { ...row, avatar_url: resolveAvatarUrl(row, signed) };
}
async function attachPersonAvatars(s: Awaited<ReturnType<typeof createClient>>, people: (Person & AvatarFields)[]): Promise<Person[]> {
  const signed = await signAvatarPaths(s, people.map((p) => (p.avatar_source === "upload" ? p.avatar_path : null)));
  return people.map((p) => ({
    id: p.id, full_name: p.full_name, color: p.color,
    avatar_url: resolveAvatarUrl(p, p.avatar_path ? signed.get(p.avatar_path) : null),
  }));
}


/** Ticket search: free text over the inbox columns, or a ticket number ("SR-1042" / "1042"). */
function srSearch(q: string | undefined) {
  const raw = (q ?? "").trim();
  const num = /^(?:sr-?)?(\d{1,9})$/i.exec(raw)?.[1];
  const term = searchTerm(q);
  if (!term) return null;
  const cols = ["summary", "description", "customer_name", "contact_name", "site_address", "site_city", "project_name"].map((c) => `${c}.ilike.${term}`);
  return [...cols, ...(num ? [`number.eq.${num}`] : [])].join(",");
}
type SRQuery = { or(f: string): SRQuery; eq(c: string, v: unknown): SRQuery; is(c: string, v: null): SRQuery; in(c: string, v: readonly unknown[]): SRQuery };
function srFilters<Q>(q0: Q, f: SRPageFilter, status: SRPageFilter["status"]): Q {
  let q = q0 as unknown as SRQuery;
  const or = srSearch(f.q);
  if (or) q = q.or(or);
  if (f.channel) q = q.eq("channel", f.channel);
  if (f.warranty) q = q.eq("warranty_state", f.warranty);
  if (f.assignee === "none") q = q.is("assignee_id", null);
  else if (f.assignee) q = q.eq("assignee_id", f.assignee);
  if (status === "open" || !status) q = q.in("status", SR_OPEN);
  else if (status !== "all") q = q.eq("status", status);
  return q as unknown as Q;
}
/** One query for all service/warranty visits on this inbox page (no N+1). */
async function loadTicketVisits(s: UserDb, requestIds: string[]): Promise<(TicketVisitCrew & { request_id: string })[]> {
  if (!requestIds.length) return [];
  const { data, error } = await s.from("jobs").select(
    "id, service_request_id, starts_at, status, kind, job_assignments(profiles(id, full_name, color, avatar_source, avatar_path, google_avatar_url))",
  ).in("service_request_id", requestIds);
  fail(error);
  type Row = {
    id: string; service_request_id: string; starts_at: string; status: JobView["status"]; kind: JobView["kind"];
    job_assignments: { profiles: (Person & AvatarFields) | null }[];
  };
  const visits = ((data ?? []) as unknown as Row[]).map((r) => ({
    request_id: r.service_request_id, job_id: r.id, starts_at: iso(r.starts_at)!, status: r.status, kind: r.kind,
    techs: r.job_assignments.map((a) => a.profiles).filter((x): x is Person & AvatarFields => !!x),
  }));
  const signed = await signAvatarPaths(s, visits.flatMap((v) => v.techs).map((p) => (p.avatar_source === "upload" ? p.avatar_path : null)));
  return visits.map((v) => ({
    ...v,
    techs: v.techs.map((p) => ({
      id: p.id, full_name: p.full_name, color: p.color,
      avatar_url: resolveAvatarUrl(p, p.avatar_path ? signed.get(p.avatar_path) : null),
    })),
  }));
}

const MAX_PICKS = 25;
type PickRaw = Pick<Project, "id" | "name" | "type" | "status" | "customer_id" | "updated_at"> & { warranty_months: number | null; customers: { name: string } | null; jobs: { starts_at: string; ends_at: string; status: Job["status"]; completed_at: string | null; kind: Job["kind"] }[] };
const toPick = (r: PickRaw): ProjectPick => ({
  id: r.id, name: r.name, type: r.type, status: r.status, customer_id: r.customer_id, customer_name: r.customers?.name ?? "",
  completed_at: projectDates(r.jobs).completed_date, warranty_months: r.warranty_months ?? DEFAULT_WARRANTY_MONTHS,
});

/** Supabase client acting as one user (cookie session on the website, bearer token on /api/mcp). */
export type UserDb = Awaited<ReturnType<typeof createClient>>;

/** Default: the signed-in user's cookie session. Pass another factory (e.g. a bearer-token client) to reuse the same logic. */

const TASK_SELECT = "*, creator:profiles!tasks_created_by_fkey(id, full_name, color, avatar_source, avatar_path, google_avatar_url), projects(id, name), customers(id, name), service_requests(id, number, summary), task_assignees(profile_id, assigned_at, profiles(id, full_name, color, avatar_source, avatar_path, google_avatar_url))";
type TaskAssigneeEmbed = { profile_id: string; assigned_at?: string; profiles: (Person & AvatarFields) | null };
type TaskRowRaw = Omit<Task, "assignee_ids"> & {
  creator: (Person & AvatarFields) | null;
  projects: { id: string; name: string } | null;
  customers: { id: string; name: string } | null;
  service_requests: { id: string; number: number; summary: string } | null;
  task_assignees: TaskAssigneeEmbed[] | null;
};
function assigneeIdsOf(rows: { profile_id: string }[] | null | undefined): string[] {
  return [...new Set((rows ?? []).map((a) => a.profile_id).filter(Boolean))];
}
function toTaskView(r: TaskRowRaw, avatars: Map<string, string>): TaskView {
  const person = (p: (Person & AvatarFields) | null): Person | null => p ? {
    id: p.id, full_name: p.full_name, color: p.color,
    avatar_url: resolveAvatarUrl(p, p.avatar_path ? avatars.get(p.avatar_path) ?? null : null),
  } : null;
  const { creator, projects, customers, service_requests: sr, task_assignees, ...t } = r;
  const embeds = [...(task_assignees ?? [])].sort((a, b) => (a.assigned_at ?? "").localeCompare(b.assigned_at ?? ""));
  const assignees = embeds.map((a) => person(a.profiles)).filter((p): p is Person => !!p);
  return {
    ...t,
    due_date: t.due_date ?? null,
    assignee_ids: assigneeIdsOf(embeds),
    assignees,
    creator: person(creator) ?? { id: t.created_by, full_name: "Unknown", color: "#64748b" },
    project_name: projects?.name ?? null,
    customer_name: customers?.name ?? null,
    service_request_number: sr?.number ?? null,
    service_request_summary: sr?.summary ?? null,
  };
}
async function taskIdsAssignedTo(s: UserDb, profileId: string): Promise<string[]> {
  const { data, error } = await s.from("task_assignees").select("task_id").eq("profile_id", profileId);
  fail(error);
  return [...new Set((data ?? []).map((r) => (r as { task_id: string }).task_id))];
}
async function assignedTaskIdSet(s: UserDb): Promise<Set<string>> {
  const { data, error } = await s.from("task_assignees").select("task_id");
  fail(error);
  return new Set((data ?? []).map((r) => (r as { task_id: string }).task_id));
}
async function replaceTaskAssignees(s: UserDb, taskId: string, ids: string[]) {
  const { error: delErr } = await s.from("task_assignees").delete().eq("task_id", taskId);
  fail(delErr);
  const rows = [...new Set(ids.filter(Boolean))].map((profile_id) => ({ task_id: taskId, profile_id }));
  if (!rows.length) return;
  const { error } = await s.from("task_assignees").insert(rows);
  fail(error);
}

export function supabaseRepo(db: () => Promise<UserDb> = createClient): Repo {
  return {
    async listCustomers(q) {
      const s = await db();
      let query = s.from("customers").select("*, contacts(name, is_primary), projects(count)").order("name");
      if (q) {
        const term = `%${q.replace(/[%_,()]/g, " ").trim()}%`;
        query = query.or(`name.ilike.${term},city.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
      }
      const { data, error } = await query;
      fail(error);
      return (data ?? []).map((r) => {
        const { contacts, projects, ...c } = r as Customer & { contacts: { name: string; is_primary: boolean }[]; projects: { count: number }[] };
        return { ...c, primary_contact: contacts.find((x) => x.is_primary)?.name ?? contacts[0]?.name ?? null, project_count: projects[0]?.count ?? 0 } satisfies CustomerListItem;
      });
    },
    async pageCustomers(f) {
      const s = await db();
      const { p, n, from, to } = pageBounds(f.page, f.size ?? PAGE_SIZE);
      // name, company, contact names, email, address, phone (digits-only too): see src/lib/search.ts
      const search = parseSearch(f.q);
      const embed = search ? ", customer_search!inner()" : "";
      const run = (a: number, b: number) => {
        let q = s.from("customers").select(`id, name, phone, email, address, city, state, zip, tags, contacts(name, is_primary)${embed}`, { count: "exact" });
        if (search) q = applySearch(q, "customer_search", search);
        q = f.sort === "newest" ? q.order("created_at", { ascending: false }) : q.order("name", { ascending: f.sort !== "name_desc" });
        return q.order("id").range(a, b);
      };
      const first = await run(from, to);
      let { data, count, error } = first;
      const { status } = first;
      if (status === 416 || error?.code === "PGRST103") { // page past the end (e.g. after a search): show the last page
        // A 416 response carries no count, so ask for it with a cheap head query.
        let cq = s.from("customers").select(`id${embed}`, { count: "exact", head: true });
        if (search) cq = applySearch(cq, "customer_search", search);
        const c = await cq;
        fail(c.error);
        count = c.count;
        const last = Math.max(0, Math.ceil((count ?? 0) / n) - 1);
        ({ data, error } = await run(last * n, last * n + n - 1));
        fail(error);
        return { items: mapCustomers(data), total: count ?? 0, page: last + 1, size: n };
      }
      fail(error);
      return { items: mapCustomers(data), total: count ?? 0, page: p, size: n };
    },
    async searchCustomerHits(q, limit = 10) {
      const parsed = parseSearch(q);
      if (!parsed) return [];
      const n = Math.min(Math.max(1, limit), 10);
      const s = await db();
      let query = s.from("customers").select("id, name, address, city, state, zip, customer_search!inner()");
      query = applySearch(query, "customer_search", parsed);
      const { data, error } = await query.order("name").order("id").range(0, n - 1);
      fail(error);
      return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, address: formatAddress(c) }));
    },
    async getCustomer(id) {
      const { data, error } = await (await db()).from("customers").select("*").eq("id", id).maybeSingle();
      fail(error);
      return data as Customer | null;
    },
    async createCustomer(input) {
      const { data, error } = await (await db()).from("customers").insert({ ...input, ...emptyGeocode() }).select().single();
      fail(error);
      return data as Customer;
    },
    async updateCustomer(id, input) {
      const s = await db();
      const { data: prev } = await s.from("customers").select("address, city, state, zip").eq("id", id).maybeSingle();
      const patch = addressChanged(prev, input) ? { ...input, ...emptyGeocode() } : input;
      const { error } = await s.from("customers").update(patch).eq("id", id);
      fail(error);
    },
    async listContacts(customerId) {
      const { data, error } = await (await db()).from("contacts").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("name");
      fail(error);
      return (data ?? []) as Contact[];
    },
    async addContact(customerId, input) {
      const s = await db();
      if (input.is_primary) fail((await s.from("contacts").update({ is_primary: false }).eq("customer_id", customerId)).error);
      fail((await s.from("contacts").insert({ ...input, customer_id: customerId })).error);
    },
    async deleteContact(id) {
      fail((await (await db()).from("contacts").delete().eq("id", id)).error);
    },
    async listTeam() {
      const s = await db();
      const [{ data: profiles, error: e1 }, { data: invites }] = await Promise.all([
        s.from("profiles").select("*").is("deleted_at", null),
        s.from("invites").select("*"), // RLS: admins only; others get []
      ]);
      fail(e1);
      const merged = mergeTeam((profiles ?? []) as Profile[], invites ?? []);
      const signed = await signAvatarPaths(s, merged.map((m) => (m.avatar_source === "upload" ? m.avatar_path : null)));
      return merged.map((m) => ({ ...m, avatar_url: resolveAvatarUrl(m, m.avatar_path ? signed.get(m.avatar_path) : null) }));
    },
    async searchWorkspace(q) {
      const parsed = parseSearch(q);
      if (!parsed) return emptyWorkspaceSearch();
      const s = await db();
      const [{ data: auth }, custQ, projQ] = await Promise.all([
        s.auth.getUser(),
        (async () => {
          let query = s.from("customers").select("id, name, phone, email, address, city, state, zip, customer_search!inner()", { count: "exact" });
          query = applySearch(query, "customer_search", parsed);
          return query.order("name").order("id").range(0, WORKSPACE_SEARCH_LIMIT - 1);
        })(),
        (async () => {
          let query = s.from("projects").select("id, name, hcp_job_number, customers(name, address, city, state, zip), project_search!inner()", { count: "exact" });
          query = applySearch(query, "project_search", parsed);
          return query.order("name").order("id").range(0, WORKSPACE_SEARCH_LIMIT - 1);
        })(),
      ]);
      fail(custQ.error);
      fail(projQ.error);
      const uid = auth.user?.id ?? "";
      let peopleQ = s.from("profiles").select("id, full_name, email, role, title, deleted_at", { count: "exact" }).is("deleted_at", null);
      for (const token of parsed.tokens) {
        peopleQ = peopleQ.or(`full_name.ilike."%${token}%",email.ilike."%${token}%"`);
      }
      const peopleRes = await peopleQ.order("full_name").order("id").range(0, WORKSPACE_SEARCH_LIMIT - 1);
      fail(peopleRes.error);

      const { data: me } = uid ? await s.from("profiles").select("id, role").eq("id", uid).maybeSingle() : { data: null };
      const staff = (me as { role?: Role | null } | null)?.role === "admin" || (me as { role?: Role | null } | null)?.role === "manager";

      type Cust = { id: string; name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };
      type CustAddr = { name: string; address: string | null; city: string | null; state: string | null; zip: string | null };
      type Proj = { id: string; name: string; hcp_job_number?: string | null; customers: CustAddr | CustAddr[] | null };
      type Pers = { id: string; full_name: string; email: string; role: Role | null; title: string | null };
      const oneCust = (v: CustAddr | CustAddr[] | null | undefined): CustAddr | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

      const customers: WorkspaceSearchHit[] = ((custQ.data ?? []) as Cust[]).map((c) => ({
        id: c.id, kind: "customer", title: c.name, subtitle: customerSubtitle(c), href: `/customers/${c.id}`,
      }));
      const projects: WorkspaceSearchHit[] = ((projQ.data ?? []) as Proj[]).map((row) => {
        const c = oneCust(row.customers);
        return {
          id: row.id, kind: "project", title: row.name,
          subtitle: projectSubtitle({ customer_name: c?.name, hcp_job_number: row.hcp_job_number, address: formatAddress(c) }),
          href: `/projects/${row.id}`,
        };
      });
      const people: WorkspaceSearchHit[] = ((peopleRes.data ?? []) as Pers[]).map((row) => ({
        id: row.id, kind: "person", title: row.full_name, subtitle: personSubtitle(row), href: personHref({ profileId: row.id, viewerId: uid, staff }),
      }));
      return {
        customers: { items: customers, total: custQ.count ?? customers.length },
        projects: { items: projects, total: projQ.count ?? projects.length },
        people: { items: people, total: peopleRes.count ?? people.length },
      };
    },
    async getProfile(id) {
      const s = await db();
      const { data, error } = await s.from("profiles").select("*").eq("id", id).maybeSingle();
      fail(error);
      if (!data) return null;
      const profile = await withAvatarUrl(s, data as Profile);
      return { ...profile, fleet_access: !!profile.fleet_access, can_delete: !!profile.can_delete, ...normalizeTeamSmsPrefs(profile) };
    },
    async upsertInvite(input) {
      const row = {
        email: input.email.toLowerCase(), role: input.role, full_name: input.full_name,
        title: input.title, phone: input.phone, color: input.color,
        ...(input.avatar_source !== undefined ? { avatar_source: input.avatar_source } : {}),
        ...(input.avatar_path !== undefined ? { avatar_path: input.avatar_path } : {}),
      };
      fail((await (await db()).from("invites").upsert(row)).error);
    },
    async removeFromTeam(email) {
      fail((await (await db()).from("invites").delete().eq("email", email.toLowerCase())).error);
    },
    async setActive(profileId, active) {
      fail((await (await db()).from("profiles").update({ active }).eq("id", profileId).is("deleted_at", null)).error);
    },
    async uploadAvatar(target, file) {
      const s = await db();
      const email = target.email.toLowerCase();
      const folder = avatarStorageFolder(target.profile_id, email);
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      fail((await s.storage.from("avatars").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false })).error);
      const prev = target.profile_id
        ? (await s.from("profiles").select("avatar_path").eq("id", target.profile_id).maybeSingle()).data?.avatar_path
        : (await s.from("invites").select("avatar_path").eq("email", email).maybeSingle()).data?.avatar_path;
      if (target.profile_id) {
        fail((await s.from("profiles").update({ avatar_source: "upload", avatar_path: path }).eq("id", target.profile_id)).error);
        // keep invite in sync when present
        await s.from("invites").update({ avatar_source: "upload", avatar_path: path }).eq("email", email);
      } else {
        fail((await s.from("invites").update({ avatar_source: "upload", avatar_path: path }).eq("email", email)).error);
      }
      if (prev && prev !== path) await s.storage.from("avatars").remove([prev]);
    },
    async setAvatarSource(target, source) {
      const s = await db();
      const email = target.email.toLowerCase();
      if (target.profile_id) {
        const patch: Record<string, unknown> = { avatar_source: source };
        if (source === "none") patch.avatar_path = null;
        fail((await s.from("profiles").update(patch).eq("id", target.profile_id)).error);
        await s.from("invites").update({ avatar_source: source, ...(source === "none" ? { avatar_path: null } : {}) }).eq("email", email);
      } else {
        fail((await s.from("invites").update({ avatar_source: source, ...(source === "none" ? { avatar_path: null } : {}) }).eq("email", email)).error);
      }
    },
    async removeAvatar(target) {
      const s = await db();
      const email = target.email.toLowerCase();
      let prev: string | null = null;
      if (target.profile_id) {
        const { data } = await s.from("profiles").select("avatar_path").eq("id", target.profile_id).maybeSingle();
        prev = data?.avatar_path ?? null;
        fail((await s.from("profiles").update({ avatar_source: "none", avatar_path: null }).eq("id", target.profile_id)).error);
      }
      const inv = await s.from("invites").select("avatar_path").eq("email", email).maybeSingle();
      prev = prev ?? inv.data?.avatar_path ?? null;
      await s.from("invites").update({ avatar_source: "none", avatar_path: null }).eq("email", email);
      if (prev) await s.storage.from("avatars").remove([prev]);
    },
    async syncOwnGoogleAvatar(googleUrl) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const patch: Record<string, unknown> = { google_avatar_url: googleUrl };
      const { data: p } = await s.from("profiles").select("avatar_source").eq("id", user.id).maybeSingle();
      if (googleUrl && (p?.avatar_source === "none" || !p?.avatar_source)) patch.avatar_source = "google";
      fail((await s.from("profiles").update(patch).eq("id", user.id)).error);
    },
    async updateOwnAvatar(patch) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const email = (user.email ?? "").toLowerCase();
      if (patch.clear) return this.removeAvatar({ email, profile_id: user.id });
      if (patch.file) return this.uploadAvatar({ email, profile_id: user.id }, patch.file);
      if (patch.avatar_source) return this.setAvatarSource({ email, profile_id: user.id }, patch.avatar_source);
    },
    async counts() {
      const T = todayKey();
      const { data, error } = await (await db()).rpc("home_counts", {
        p_day_start: zonedToUtc(T, 0),
        p_day_end: zonedToUtc(addDays(T, 1), 0),
      });
      fail(error);
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        customers: asInt(row.customers),
        team: asInt(row.team),
        invited: asInt(row.invited),
        activeProjects: asInt(row.active_projects),
        proposed: asInt(row.proposed),
        jobsToday: asInt(row.jobs_today),
        awaitingReview: asInt(row.awaiting_review),
      };
    },

    // ---------------------------------------------------------------- phase 2
    async listProjects(f = {}) {
      const s = await db();
      let q = s.from("projects").select("*, customers(name), milestones(done), jobs(starts_at, ends_at, status, job_assignments(profiles(id, full_name, color, avatar_source, avatar_path, google_avatar_url)))").order("updated_at", { ascending: false });
      if (f.status) q = q.eq("status", f.status);
      if (f.customerId) q = q.eq("customer_id", f.customerId);
      const { data, error } = await q; fail(error);
      const term = f.q?.toLowerCase().trim();
      const nowIso = new Date().toISOString();
      type Row = Project & { customers: { name: string } | null; milestones: { done: boolean }[]; jobs: { starts_at: string; ends_at: string; status: Job["status"]; job_assignments: { profiles: Person | null }[] }[] };
      const rows = ((data ?? []) as Row[]).map(({ customers, milestones, jobs, ...p }) => {
        const live = jobs.filter((j) => j.status !== "cancelled");
        const team = new Map<string, Person & AvatarFields>();
        for (const j of live) for (const a of j.job_assignments) if (a.profiles) team.set(a.profiles.id, a.profiles as Person & AvatarFields);
        return {
          ...p, value: Number(p.value), est_rebate: Number(p.est_rebate), customer_name: customers?.name ?? "",
          next_visit: live.filter((j) => iso(j.ends_at)! > nowIso && (j.status === "scheduled" || j.status === "in_progress")).map((j) => iso(j.starts_at)!).sort()[0] ?? null,
          team: [...team.values()], done_milestones: milestones.filter((m) => m.done).length, total_milestones: milestones.length,
        };
      }).filter((p) => !term || `${p.name} ${p.customer_name} ${p.scope}`.toLowerCase().includes(term));
      const allPeople = rows.flatMap((r) => r.team);
      const signed = await signAvatarPaths(s, allPeople.map((p) => (p.avatar_source === "upload" ? p.avatar_path : null)));
      return rows.map((r) => ({
        ...r,
        team: r.team.map((p) => ({
          id: p.id, full_name: p.full_name, color: p.color,
          avatar_url: resolveAvatarUrl(p, p.avatar_path ? signed.get(p.avatar_path) : null),
        })),
      })) satisfies ProjectListItem[];
    },
    async pageProjects(f) {
      const s = await db();
      const { p, n, from, to } = pageBounds(f.page, f.size ?? PAGE_SIZE);
      // project name/number/scope/site address + its customer's name, contacts, address, phone: see src/lib/search.ts
      const search = parseSearch(f.q);
      const embed = search ? ", project_search!inner()" : "";
      const countsP = (async () => {
        const { data, error } = await s.rpc("project_status_counts", {
          p_tokens: search && !search.digits ? search.tokens : null,
          p_text: search?.text ?? null,
          p_digits: search?.digits ?? null,
        });
        fail(error);
        return projectStatusCountsFromRpc(data);
      })();
      const run = (a: number, b: number) => {
        let q = s.from("projects").select(PROJECT_PAGE_SELECT + embed);
        q = f.status ? q.eq("status", f.status) : q.neq("status", "cancelled");
        if (search) q = applySearch(q, "project_search", search);
        q = f.sort === "name" ? q.order("name") : f.sort === "value" ? q.order("value", { ascending: false }) : q.order(f.sort === "newest" ? "created_at" : "updated_at", { ascending: false });
        return q.order("id").range(a, b);
      };
      let page = p;
      const first = await run(from, to);
      let { data, error } = first;
      const { status } = first;
      const counts = await countsP;
      const total = counts[f.status ?? "active"] ?? 0;
      if (status === 416 || error?.code === "PGRST103") { // page past the end: show the last page
        const last = Math.max(0, Math.ceil(total / n) - 1);
        ({ data, error } = await run(last * n, last * n + n - 1));
        page = last + 1;
      }
      fail(error);
      const nowIso = new Date().toISOString();
      type Row = Pick<Project, "id" | "name" | "type" | "status" | "value" | "est_rebate" | "updated_at"> & { customers: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null } | null; milestones: { done: boolean }[]; jobs: { starts_at: string; ends_at: string; status: Job["status"]; completed_at: string | null; kind: Job["kind"]; job_assignments: { profiles: Person | null }[] }[] };
      const rows = ((data ?? []) as unknown as Row[]).map(({ customers, milestones, jobs, ...r }) => {
        const live = jobs.filter((j) => j.status !== "cancelled");
        const team = new Map<string, Person & AvatarFields>();
        for (const j of live) for (const a of j.job_assignments) if (a.profiles) team.set(a.profiles.id, a.profiles as Person & AvatarFields);
        return {
          ...r, value: Number(r.value), est_rebate: Number(r.est_rebate), customer_name: customers?.name ?? "",
          address: formatAddress(customers), ...projectDates(jobs),
          next_visit: live.filter((j) => iso(j.ends_at)! > nowIso && (j.status === "scheduled" || j.status === "in_progress")).map((j) => iso(j.starts_at)!).sort()[0] ?? null,
          team: [...team.values()], done_milestones: milestones.filter((m) => m.done).length, total_milestones: milestones.length,
        };
      });
      const signed = await signAvatarPaths(s, rows.flatMap((r) => r.team).map((x) => (x.avatar_source === "upload" ? x.avatar_path : null)));
      const items: ProjectRow[] = rows.map((r) => ({
        ...r, team: r.team.map((x) => ({ id: x.id, full_name: x.full_name, color: x.color, avatar_url: resolveAvatarUrl(x, x.avatar_path ? signed.get(x.avatar_path) : null) })),
      }));
      return { items, total, page, size: n, counts };
    },
    async getProject(id) {
      const { data, error } = await (await db()).from("projects").select("*").eq("id", id).maybeSingle(); fail(error);
      return data ? { ...(data as Project), value: Number(data.value), est_rebate: Number(data.est_rebate) } : null;
    },
    async getProjectHit(id) {
      const { data, error } = await (await db()).from("projects")
        .select("id, name, status, hcp_job_number, customers(name)").eq("id", id).maybeSingle();
      fail(error);
      return data ? toProjectHit(data as Parameters<typeof toProjectHit>[0]) : null;
    },
    async searchProjectHits(f) {
      const parsed = parseSearch(f.q);
      if (!parsed && !f.customerId) return [];
      const s = await db();
      const limit = Math.min(Math.max(1, f.limit ?? PROJECT_HIT_LIMIT), PROJECT_HIT_LIMIT);
      const embed = parsed ? ", project_search!inner()" : "";
      let q = s.from("projects")
        .select(`id, name, status, hcp_job_number, customers(name)${embed}`)
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(limit);
      if (f.customerId) q = q.eq("customer_id", f.customerId);
      if (parsed) q = applySearch(q, "project_search", parsed);
      const { data, error } = await q; fail(error);
      return ((data ?? []) as unknown as Parameters<typeof toProjectHit>[0][]).map(toProjectHit);
    },
    async createProject(input) {
      const { data, error } = await (await db()).from("projects").insert(input).select().single(); fail(error);
      return data as Project;
    },
    async updateProject(id, patch) { fail((await (await db()).from("projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)).error); },
    async listMilestones(projectId) {
      const { data, error } = await (await db()).from("milestones").select("*").eq("project_id", projectId)
        .order("due_date", { ascending: true, nullsFirst: false }).order("sort_order"); fail(error);
      return (data ?? []) as Milestone[];
    },
    async addMilestone(projectId, m) {
      const s = await db();
      const { count } = await s.from("milestones").select("id", { count: "exact", head: true }).eq("project_id", projectId);
      fail((await s.from("milestones").insert({ project_id: projectId, name: m.name, due_date: m.due_date, sort_order: count ?? 0 })).error);
    },
    async updateMilestone(id, patch) { fail((await (await db()).from("milestones").update(patch).eq("id", id)).error); },
    async deleteMilestone(id) { fail((await (await db()).from("milestones").delete().eq("id", id)).error); },
    async listAssignable() {
      const s = await db();
      const { data, error } = await s.from("profiles").select("id, full_name, color, role, avatar_source, avatar_path, google_avatar_url").not("role", "is", null).eq("active", true).is("deleted_at", null); fail(error);
      const order: Record<string, number> = { tech: 0, manager: 1, admin: 2 };
      const rows = ((data ?? []) as (Person & AvatarFields & { role: string })[]).sort((a, b) => order[a.role] - order[b.role] || a.full_name.localeCompare(b.full_name));
      const people = await attachPersonAvatars(s, rows);
      return people.map((p, i) => ({ ...p, role: rows[i].role }));
    },
    async listJobs(f = {}) {
      const s = await db();
      // Single page only — do not walk every matching row. PostgREST caps a select at 1,000;
      // callers that need a complete list must pass a tight filter (customer, project, date window).
      const cap = Math.min(Math.max(f.limit ?? 1000, 1), 1000);
      let q = s.from("jobs").select(JOB_SELECT);
      if (f.order === "completed_at") q = q.order("completed_at", { ascending: false, nullsFirst: false }).order("id");
      else q = q.order("starts_at").order("id");
      q = q.range(0, cap - 1);
      if (f.from) q = q.gt("ends_at", f.from);
      if (f.to) q = q.lt("starts_at", f.to);
      if (f.projectId) q = q.eq("project_id", f.projectId);
      if (f.customerId) q = q.eq("projects.customer_id", f.customerId);
      if (f.serviceRequestId) q = q.eq("service_request_id", f.serviceRequestId);
      if (f.status) q = q.in("status", f.status);
      const { data, error } = await q; fail(error);
      const jobs = ((data ?? []) as unknown as JobRow[]).map(toJobView).filter((j) => !f.assignee || j.assignees.some((a) => a.id === f.assignee));
      const flat = jobs.flatMap((j) => j.assignees as (Person & AvatarFields)[]);
      const signed = await signAvatarPaths(s, flat.map((p) => (p.avatar_source === "upload" ? p.avatar_path : null)));
      for (const j of jobs) {
        j.assignees = j.assignees.map((a) => {
          const p = a as Person & AvatarFields;
          return { id: p.id, full_name: p.full_name, color: p.color, avatar_url: resolveAvatarUrl(p, p.avatar_path ? signed.get(p.avatar_path) : null) };
        });
      }
      return jobs;
    },
    async getJob(id) {
      const s = await db();
      const { data, error } = await s.from("jobs").select(JOB_SELECT).eq("id", id).maybeSingle(); fail(error);
      if (!data) return null;
      const job = toJobView(data as unknown as JobRow);
      const signed = await signAvatarPaths(s, (job.assignees as (Person & AvatarFields)[]).map((p) => (p.avatar_source === "upload" ? p.avatar_path : null)));
      job.assignees = job.assignees.map((a) => {
        const p = a as Person & AvatarFields;
        return { id: p.id, full_name: p.full_name, color: p.color, avatar_url: resolveAvatarUrl(p, p.avatar_path ? signed.get(p.avatar_path) : null) };
      });
      return job;
    },
    async createJob(input, assignees) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const { data, error } = await s.from("jobs").insert(input).select("id").single(); fail(error);
      if (assignees.length) fail((await s.from("job_assignments").insert([...new Set(assignees)].map((profile_id) => ({ job_id: data!.id, profile_id })))).error);
      const id = data!.id as string;
      const view = await this.getJob(id);
      if (view) {
        await notifyVisitCreated({ store: supabaseTeamSmsStore(s), actorId: user?.id ?? null }, jobSnap(view), assignees);
      }
      return id;
    },
    async updateJob(id, patch) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const previous = await this.getJob(id);
      const { data, error } = await s.from("jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id"); fail(error);
      if (!data?.length) throw new Error("Job not found or not allowed");
      const next = await this.getJob(id);
      if (previous && next) {
        await notifyVisitUpdated({ store: supabaseTeamSmsStore(s), actorId: user?.id ?? null }, jobSnap(previous), jobSnap(next));
      }
    },
    async setAssignees(jobId, ids) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const previous = await this.getJob(jobId);
      const keep = [...new Set(ids)];
      let del = s.from("job_assignments").delete().eq("job_id", jobId);
      if (keep.length) del = del.not("profile_id", "in", `(${keep.join(",")})`);
      fail((await del).error);
      if (keep.length) fail((await s.from("job_assignments").upsert(keep.map((profile_id) => ({ job_id: jobId, profile_id })), { onConflict: "job_id,profile_id", ignoreDuplicates: true })).error);
      const next = await this.getJob(jobId);
      if (previous && next) {
        await notifyVisitAssigneesChanged({ store: supabaseTeamSmsStore(s), actorId: user?.id ?? null }, jobSnap(next), previous.assignees.map((a) => a.id), ids);
      }
    },
    async listPhotos(f) {
      const s = await db();
      let q = s.from("photos").select("*, profiles:uploaded_by(full_name, color, deleted_at)").order("created_at");
      if (f.projectId) q = q.eq("project_id", f.projectId);
      if (f.jobId) q = q.eq("job_id", f.jobId);
      if (f.kind) q = q.eq("kind", f.kind);
      const { data, error } = await q; fail(error);
      type PhotoJoin = Omit<Photo, "url" | "uploader_name" | "uploader_color"> & { profiles: { full_name: string; color: string; deleted_at: string | null } | null };
      const rows = (data ?? []) as PhotoJoin[];
      if (!rows.length) return [];
      const { data: signed } = await s.storage.from("photos").createSignedUrls(rows.map((r) => r.storage_path), 3600);
      const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
      return rows.map(({ profiles, ...r }) => ({
        ...r,
        phase: derivePhotoPhase(r),
        url: urls.get(r.storage_path) ?? "",
        uploader_name: authorLabel(r.uploaded_by, profiles),
        uploader_color: authorColor(profiles),
      }));
    },
    async addPhoto(meta, file) {
      const s = await db();
      const phase = derivePhotoPhase({ kind: meta.kind, requirement_id: meta.requirement_id ?? null, phase: meta.phase });
      const kind = kindForPhase(phase, meta.kind);
      const path = `${meta.project_id}/${kind}/${crypto.randomUUID()}.jpg`;
      fail((await s.storage.from("photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false })).error);
      const row = {
        project_id: meta.project_id, job_id: meta.job_id, kind, phase,
        caption: meta.caption,
        requirement_id: phase === "required" ? (meta.requirement_id ?? null) : null,
        storage_path: path,
      };
      const { error } = await s.from("photos").insert(row);
      if (error) { await s.storage.from("photos").remove([path]); fail(error); }
    },
    async updatePhotoPhase(id, phase) {
      const s = await db();
      const kind = kindForPhase(phase);
      fail((await s.from("photos").update({ phase, kind, requirement_id: null }).eq("id", id)).error);
    },
    async deletePhoto(id) {
      const s = await db();
      const { data } = await s.from("photos").select("storage_path").eq("id", id).maybeSingle();
      fail((await s.from("photos").delete().eq("id", id)).error);
      if (data) await s.storage.from("photos").remove([data.storage_path]);
    },
    async listPhotoRequirements(projectId, jobId) {
      let q = (await db()).from("project_photo_requirements").select("*").eq("project_id", projectId);
      q = jobId ? q.or(`job_id.is.null,job_id.eq.${jobId}`) : q.is("job_id", null);
      const { data, error } = await q.order("sort_order").order("created_at");
      fail(error);
      return ((data ?? []) as PhotoRequirement[]).sort((a, b) => (a.job_id ? 1 : 0) - (b.job_id ? 1 : 0) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    },
    async addPhotoRequirement(projectId, input) {
      const s = await db();
      const jobId = input.job_id ?? null;
      let maxQ = s.from("project_photo_requirements").select("sort_order").eq("project_id", projectId);
      maxQ = jobId ? maxQ.eq("job_id", jobId) : maxQ.is("job_id", null);
      const { data: maxRow } = await maxQ.order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const sort_order = (maxRow?.sort_order ?? -1) + 1;
      fail((await s.from("project_photo_requirements").insert({ project_id: projectId, job_id: jobId, label: input.label.trim(), note: input.note, sort_order })).error);
    },
    async updatePhotoRequirement(id, patch) {
      fail((await (await db()).from("project_photo_requirements").update(patch).eq("id", id)).error);
    },
    async deletePhotoRequirement(id) {
      fail((await (await db()).from("project_photo_requirements").delete().eq("id", id)).error);
    },
    async reorderPhotoRequirements(projectId, orderedIds) {
      const s = await db();
      for (let i = 0; i < orderedIds.length; i++) {
        fail((await s.from("project_photo_requirements").update({ sort_order: i }).eq("id", orderedIds[i]).eq("project_id", projectId).is("job_id", null)).error);
      }
    },
    async listProjectFiles(f) {
      const s = await db();
      let q = s.from("project_files").select("*, profiles:uploaded_by(full_name, color, deleted_at)").eq("project_id", f.projectId).order("created_at");
      if (f.projectOnly) q = q.is("job_id", null);
      else if (f.jobId) q = q.eq("job_id", f.jobId);
      const { data, error } = await q; fail(error);
      type FileJoin = Omit<ProjectFile, "url" | "download_url" | "uploader_name"> & { profiles: { full_name: string; color: string; deleted_at: string | null } | null };
      const rows = (data ?? []) as FileJoin[];
      if (!rows.length) return [];
      const paths = rows.map((r) => r.storage_path);
      const [{ data: preview }, { data: downloads }] = await Promise.all([
        s.storage.from("project-files").createSignedUrls(paths, 3600),
        s.storage.from("project-files").createSignedUrls(paths, 3600, { download: true }),
      ]);
      const previewMap = new Map((preview ?? []).map((x) => [x.path, x.signedUrl]));
      const downloadMap = new Map((downloads ?? []).map((x) => [x.path, x.signedUrl]));
      return rows.map(({ profiles, ...r }) => ({
        ...r,
        url: previewMap.get(r.storage_path) ?? "",
        download_url: downloadMap.get(r.storage_path) ?? previewMap.get(r.storage_path) ?? "",
        uploader_name: authorLabel(r.uploaded_by, profiles),
      }));
    },
    async addProjectFile(meta, file) {
      const err = validateProjectFile(file);
      if (err) throw new Error(err);
      const s = await db();
      const filename = sanitizeFilename(file.name);
      const mime = mimeForFile(file);
      const path = projectFileStoragePath(meta.project_id, meta.job_id, storageExtFor(file));
      fail((await s.storage.from("project-files").upload(path, file, { contentType: mime, upsert: false })).error);
      const { error } = await s.from("project_files").insert({
        project_id: meta.project_id,
        job_id: meta.job_id,
        filename,
        mime,
        size_bytes: file.size,
        storage_path: path,
      });
      if (error) { await s.storage.from("project-files").remove([path]); fail(error); }
    },
    async deleteProjectFile(id) {
      const s = await db();
      const { data } = await s.from("project_files").select("storage_path").eq("id", id).maybeSingle();
      fail((await s.from("project_files").delete().eq("id", id)).error);
      if (data) await s.storage.from("project-files").remove([data.storage_path]);
    },
    async listNotes(f) {
      const s = await db();
      let q = s.from("notes").select("*, profiles:author_id(full_name, color, deleted_at)").order("created_at");
      if (f.jobId) q = q.eq("job_id", f.jobId);
      else if (f.customerId) q = q.eq("customer_id", f.customerId).is("project_id", null).is("job_id", null);
      else if (f.projectId) {
        const { data: js } = await s.from("jobs").select("id").eq("project_id", f.projectId);
        const ids = (js ?? []).map((j) => j.id);
        q = q.or(`project_id.eq.${f.projectId}${ids.length ? `,job_id.in.(${ids.join(",")})` : ""}`);
      }
      const { data, error } = await q; fail(error);
      type NoteJoin = Omit<Note, "author_name" | "author_color"> & { profiles: { full_name: string; color: string; deleted_at: string | null } | null };
      return ((data ?? []) as NoteJoin[]).map(({ profiles, ...n }) => ({
        ...n,
        author_name: authorLabel(n.author_id, profiles),
        author_color: authorColor(profiles),
      }));
    },
    async addNote(n) { fail((await (await db()).from("notes").insert({ job_id: n.job_id ?? null, project_id: n.project_id ?? null, customer_id: n.customer_id ?? null, body: n.body })).error); },
    async listMessages(f) {
      let q = (await db()).from("messages").select("*, profiles:sent_by(full_name, color, deleted_at)").order("created_at", { ascending: false });
      if (f.customerId) q = q.eq("customer_id", f.customerId);
      if (f.projectId) q = q.eq("project_id", f.projectId);
      const { data, error } = await q; fail(error);
      type MsgJoin = Omit<Message, "sender_name" | "sender_color"> & { profiles: { full_name: string; color: string; deleted_at: string | null } | null };
      return ((data ?? []) as MsgJoin[]).map(({ profiles, ...m }) => ({
        ...m,
        sender_name: authorLabel(m.sent_by, profiles),
        sender_color: authorColor(profiles),
      }));
    },
    async softDeleteMember(profileId, actorId) {
      const s = await db();
      const { data, error } = await s.from("profiles").select("id, email, full_name, role").eq("id", profileId).is("deleted_at", null).maybeSingle();
      fail(error);
      if (!data) throw new Error("Member not found.");
      const tombstone = `deleted-${profileId.slice(0, 8)}@deleted.invalid`;
      fail((await s.from("profiles").update({
        email: tombstone,
        full_name: "Removed user",
        phone: null,
        title: null,
        role: null,
        active: false,
        avatar_source: "none",
        avatar_path: null,
        google_avatar_url: null,
        deleted_at: new Date().toISOString(),
        deleted_by: actorId,
      }).eq("id", profileId)).error);
      await s.from("invites").delete().eq("email", data.email);
      return { email: data.email as string, full_name: data.full_name as string };
    },
    async writeAdminAudit(row) {
      fail((await (await db()).from("admin_audit").insert({
        actor_id: row.actor_id,
        action: row.action,
        target_email: row.target_email ?? null,
        target_profile_id: row.target_profile_id ?? null,
        detail: row.detail ?? {},
      })).error);
    },
    async countActiveAdmins() {
      const { count, error } = await (await db()).from("profiles").select("id", { count: "exact", head: true })
        .eq("role", "admin").eq("active", true).is("deleted_at", null);
      fail(error);
      return count ?? 0;
    },
    async logMessage(m) { fail((await (await db()).from("messages").insert(m)).error); },

    // ---------------------------------------------------------------- service requests
    async pageServiceRequests(f) {
      const s = await db();
      const { p, n, from, to } = pageBounds(f.page, f.size ?? PAGE_SIZE);
      const status = f.status ?? "open";
      const head = { count: "exact", head: true } as const;
      const countsP = Promise.all((["open", "all", ...SR_STATUSES] as const).map(async (st) => {
        const { count, error } = await srFilters(s.from("service_request_list").select("id", head), f, st);
        fail(error);
        return [st, count ?? 0] as const;
      }));
      const run = (a: number, b: number) =>
        srFilters(s.from("service_request_list").select("*", { count: "exact" }), f, status).order("received_at", { ascending: false }).order("id").range(a, b);
      let page = p;
      const first = await run(from, to);
      let { data, count, error } = first;
      if (first.status === 416 || error?.code === "PGRST103") { // past the end: show the last page
        count = Object.fromEntries(await countsP)[status] ?? 0;
        const last = Math.max(0, Math.ceil(count / n) - 1);
        ({ data, error } = await run(last * n, last * n + n - 1));
        page = last + 1;
      }
      fail(error);
      const items = (data ?? []) as ServiceRequestView[];
      const visits = await loadTicketVisits(s, items.map((t) => t.id));
      return { items: applyTicketVisits(items, visits), total: count ?? 0, page, size: n, counts: Object.fromEntries(await countsP) };
    },
    async countOpenServiceRequests() {
      return (await loadNavBadges()).openServiceRequests;
    },
    async listOpenServiceRequestPicks(limit = 25) {
      const n = Math.min(Math.max(1, limit), 25);
      const { data, error } = await (await db()).from("service_requests")
        .select("id, number, summary")
        .in("status", SR_OPEN)
        .order("received_at", { ascending: false })
        .order("id")
        .limit(n);
      fail(error);
      return (data ?? []) as { id: string; number: number; summary: string | null }[];
    },
    async getServiceRequest(id) {
      const { data, error } = await (await db()).from("service_request_list").select("*").eq("id", id).maybeSingle();
      fail(error);
      return (data as ServiceRequestView | null) ?? null;
    },
    async createServiceRequest(input) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const { data, error } = await s.from("service_requests").insert(input).select().single(); fail(error);
      const sr = data as ServiceRequest;
      fail((await s.from("service_request_events").insert({ request_id: sr.id, kind: "created", body: `Logged from ${input.channel === "email" ? "an email" : input.channel === "call" ? "a phone call" : "another channel"}.` })).error);
      await notifyServiceRequestAssigned({ store: supabaseTeamSmsStore(s), actorId: user?.id ?? null }, { id: sr.id, assigneeId: sr.assignee_id, number: sr.number, summary: sr.summary });
      return sr;
    },
    async updateServiceRequest(id, patch) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const previous = await this.getServiceRequest(id);
      const { data, error } = await s.from("service_requests").update(patch).eq("id", id).select("id"); fail(error);
      if (!data?.length) throw new Error("Service request not found or not allowed");
      const next = await this.getServiceRequest(id);
      if (next) {
        await notifyServiceRequestAssigned({ store: supabaseTeamSmsStore(s), actorId: user?.id ?? null }, { id: next.id, assigneeId: next.assignee_id, previousAssigneeId: previous?.assignee_id, number: next.number, summary: next.summary });
      }
    },
    async listServiceRequestEvents(requestId) {
      const s = await db();
      const { data, error } = await s.from("service_request_events").select("*, profiles:actor_id(full_name, color, deleted_at, avatar_source, avatar_path, google_avatar_url)").eq("request_id", requestId).order("created_at");
      fail(error);
      type EvProfile = { full_name: string; color: string; deleted_at: string | null } & AvatarFields;
      type EvJoin = Omit<SREvent, "actor_name" | "actor_color" | "actor_avatar_url"> & { profiles: EvProfile | null };
      const rows = (data ?? []) as EvJoin[];
      const signed = await signAvatarPaths(s, rows.map((r) => (r.profiles?.avatar_source === "upload" ? r.profiles.avatar_path : null)));
      return rows.map(({ profiles, ...e }) => ({
        ...e,
        actor_name: e.actor_id ? authorLabel(e.actor_id, profiles) : "System",
        actor_color: authorColor(profiles),
        actor_avatar_url: serviceRequestActorAvatarUrl(profiles, profiles?.avatar_path ? signed.get(profiles.avatar_path) ?? null : null),
        edited_at: e.edited_at ?? null,
      }));
    },
    async addServiceRequestEvent(requestId, e) {
      fail((await (await db()).from("service_request_events").insert({ request_id: requestId, kind: e.kind, body: e.body })).error);
    },
    async getServiceRequestEvent(eventId) {
      const s = await db();
      const { data, error } = await s.from("service_request_events").select("*, profiles:actor_id(full_name, color, deleted_at, avatar_source, avatar_path, google_avatar_url)").eq("id", eventId).maybeSingle();
      fail(error);
      if (!data) return null;
      type EvProfile = { full_name: string; color: string; deleted_at: string | null } & AvatarFields;
      const row = data as Omit<SREvent, "actor_name" | "actor_color" | "actor_avatar_url"> & { profiles: EvProfile | null };
      const { profiles, ...e } = row;
      const signed = await signAvatarPaths(s, [profiles?.avatar_source === "upload" ? profiles.avatar_path : null]);
      return {
        ...e,
        actor_name: e.actor_id ? authorLabel(e.actor_id, profiles) : "System",
        actor_color: authorColor(profiles),
        actor_avatar_url: serviceRequestActorAvatarUrl(profiles, profiles?.avatar_path ? signed.get(profiles.avatar_path) ?? null : null),
        edited_at: e.edited_at ?? null,
      };
    },
    async updateServiceRequestEvent(requestId, eventId, body) {
      const { data, error } = await (await db()).from("service_request_events").update({ body }).eq("id", eventId).eq("request_id", requestId).eq("kind", "note").select("id");
      fail(error);
      if (!data?.length) throw new Error("Note not found or not allowed");
    },
    async deleteServiceRequestEvent(requestId, eventId) {
      const { data, error } = await (await db()).from("service_request_events").delete().eq("id", eventId).eq("request_id", requestId).eq("kind", "note").select("id");
      fail(error);
      if (!data?.length) throw new Error("Note not found or not allowed");
    },
    async getServiceRequestPrices(ids) {
      if (!ids.length) return {};
      const { data, error } = await (await db()).from("service_request_pricing").select("service_request_id, amount").in("service_request_id", ids);
      fail(error);
      const out: Record<string, number> = {};
      for (const row of data ?? []) {
        const n = Number(row.amount);
        if (Number.isFinite(n)) out[row.service_request_id as string] = n;
      }
      return out;
    },
    async setServiceRequestPrice(id, amount) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      if (amount == null) {
        fail((await s.from("service_request_pricing").delete().eq("service_request_id", id)).error);
        return;
      }
      fail((await s.from("service_request_pricing").upsert({
        service_request_id: id,
        amount,
        currency: "USD",
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })).error);
    },
    async findProjects(f) {
      const s = await db();
      const limit = Math.min(Math.max(1, f.limit ?? 10), MAX_PICKS);
      const term = searchTerm(f.q);
      let q = s.from("projects").select("id, name, type, status, customer_id, updated_at, warranty_months, customers(name), jobs(starts_at, ends_at, status, completed_at, kind)")
        .neq("status", "cancelled").order("updated_at", { ascending: false }).order("id").limit(limit);
      if (f.customerId) q = q.eq("customer_id", f.customerId);
      if (term) {
        const { data: cs, error: ce } = await s.from("customers").select("id").ilike("name", term.slice(1, -1)).order("name").limit(MAX_CUSTOMER_MATCHES);
        fail(ce);
        const ids = (cs ?? []).map((c) => c.id as string);
        q = q.or([`name.ilike.${term}`, ...(ids.length ? [`customer_id.in.(${ids.join(",")})`] : [])].join(","));
      } else if (!f.customerId) {
        return []; // never list every project: the picker needs a customer or a search term
      }
      const { data, error } = await q; fail(error);
      return ((data ?? []) as unknown as PickRaw[]).map(toPick);
    },

    async listFleetVehicles() {
      const { data, error } = await (await db()).from("fleet_vehicles").select("geotab_device_id, label, profile_id, invite_email");
      fail(error);
      return (data ?? []) as FleetVehicleRow[];
    },
    async setFleetVehicleMapping(deviceId, patch) {
      const row = {
        geotab_device_id: deviceId,
        updated_at: new Date().toISOString(),
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.profile_id !== undefined || patch.invite_email !== undefined ? {
          profile_id: patch.profile_id ?? null,
          invite_email: patch.invite_email ?? null,
        } : {}),
      };
      fail((await (await db()).from("fleet_vehicles").upsert(row)).error);
    },
    async setFleetAccess(email, access) {
      const s = await db();
      const e = email.toLowerCase();
      fail((await s.from("invites").update({ fleet_access: access }).eq("email", e)).error);
      fail((await s.from("profiles").update({ fleet_access: access }).eq("email", e).is("deleted_at", null)).error);
    },
    async setDeleteAccess(email, access) {
      const s = await db();
      const e = email.toLowerCase();
      fail((await s.from("invites").update({ can_delete: access }).eq("email", e).eq("role", "manager")).error);
      fail((await s.from("profiles").update({ can_delete: access }).eq("email", e).eq("role", "manager").is("deleted_at", null)).error);
    },
    async setTeamSmsPrefs(email, patch) {
      await applyTeamSmsPrefs(await db(), email, patch);
    },
    async listTeamSmsOutbox() {
      const { data, error } = await (await db()).from("team_sms_outbox").select("*").order("created_at", { ascending: false });
      fail(error);
      return (data ?? []) as import("@/lib/team-sms/types").TeamSmsOutboxRow[];
    },
    async countCustomerDependents(customerId) {
      const s = await db();
      const [projects, serviceRequests] = await Promise.all([
        s.from("projects").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        s.from("service_requests").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
      ]);
      fail(projects.error);
      fail(serviceRequests.error);
      return { projects: projects.count ?? 0, serviceRequests: serviceRequests.count ?? 0 };
    },
    async deleteCustomer(id) {
      const deps = await this.countCustomerDependents(id);
      const { customerDeleteBlockers } = await import("@/lib/delete-access");
      const blocked = customerDeleteBlockers(deps);
      if (blocked) throw new Error(blocked);
      fail((await (await db()).from("customers").delete().eq("id", id)).error);
    },
    async deleteProject(id) {
      const s = await db();
      const [{ data: photos, error: pe }, { data: files, error: fe }] = await Promise.all([
        s.from("photos").select("storage_path").eq("project_id", id),
        s.from("project_files").select("storage_path").eq("project_id", id),
      ]);
      fail(pe); fail(fe);
      const photoPaths = [...new Set((photos ?? []).map((r: { storage_path: string }) => r.storage_path).filter(Boolean))];
      const filePaths = [...new Set((files ?? []).map((r: { storage_path: string }) => r.storage_path).filter(Boolean))];
      if (photoPaths.length) fail((await s.storage.from("photos").remove(photoPaths)).error);
      if (filePaths.length) fail((await s.storage.from("project-files").remove(filePaths)).error);
      fail((await s.from("projects").delete().eq("id", id)).error);
    },
    async deleteJob(id) {
      const s = await db();
      const [{ data: photos, error: pe }, { data: files, error: fe }] = await Promise.all([
        s.from("photos").select("storage_path").eq("job_id", id),
        s.from("project_files").select("storage_path").eq("job_id", id),
      ]);
      fail(pe); fail(fe);
      const photoPaths = [...new Set((photos ?? []).map((r: { storage_path: string }) => r.storage_path).filter(Boolean))];
      const filePaths = [...new Set((files ?? []).map((r: { storage_path: string }) => r.storage_path).filter(Boolean))];
      if (photoPaths.length) fail((await s.storage.from("photos").remove(photoPaths)).error);
      if (filePaths.length) fail((await s.storage.from("project-files").remove(filePaths)).error);
      fail((await s.from("jobs").delete().eq("id", id)).error);
    },
    async deleteServiceRequest(id) {
      const s = await db();
      fail((await s.from("jobs").update({ service_request_id: null }).eq("service_request_id", id)).error);
      fail((await s.from("service_requests").delete().eq("id", id)).error);
    },

    async pageTasks(f) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const uid = user?.id ?? "";
      const { data: allRows, error: allErr } = await s.from("tasks").select("id, status, due_date, created_at, priority, created_by, task_assignees(profile_id)");
      fail(allErr);
      const visible = ((allRows ?? []) as { id: string; status: Task["status"]; due_date: string | null; created_at: string; priority: Task["priority"]; created_by: string; task_assignees: { profile_id: string }[] | null }[]).map((r) => ({
        ...r,
        assignee_ids: assigneeIdsOf(r.task_assignees),
        title: "", description: null, project_id: null, customer_id: null, service_request_id: null, completed_at: null, email_message_id: null, updated_at: r.created_at,
      })) as Task[];
      const counts = taskCounts(visible, uid);
      let q = s.from("tasks").select(TASK_SELECT, { count: "exact" });
      if (f.tab === "mine" && uid) {
        const ids = await taskIdsAssignedTo(s, uid);
        if (!ids.length) {
          const page = pageBounds(f.page, f.size ?? PAGE_SIZE);
          return { items: [], total: 0, page: page.p, size: page.n, counts };
        }
        q = q.in("id", ids);
      }
      if (f.status === "done" || f.status === "open" || f.status === "in_progress") q = q.eq("status", f.status);
      else q = q.in("status", TASK_ACTIVE);
      if (f.tab !== "mine") {
        if (f.assignee === "none") {
          const assigned = await assignedTaskIdSet(s);
          if (assigned.size) q = q.not("id", "in", `(${[...assigned].join(",")})`);
        } else if (f.assignee) {
          const ids = await taskIdsAssignedTo(s, f.assignee);
          if (!ids.length) {
            const page = pageBounds(f.page, f.size ?? PAGE_SIZE);
            return { items: [], total: 0, page: page.p, size: page.n, counts };
          }
          q = q.in("id", ids);
        }
      }
      if (f.projectId) q = q.eq("project_id", f.projectId);
      if (f.customerId) q = q.eq("customer_id", f.customerId);
      const today = todayKey();
      if (f.due === "none") q = q.is("due_date", null);
      else if (f.due === "today") q = q.eq("due_date", today);
      else if (f.due === "upcoming") q = q.gt("due_date", today);
      else if (f.due === "overdue") q = q.lt("due_date", today).neq("status", "done");
      const term = searchTerm(f.q);
      if (term) q = q.or(`title.ilike.${term},description.ilike.${term}`);
      // Fetch the matching set and sort in app code so null due dates stay last (PostgREST nullsFirst is version-dependent).
      const { data, error } = await q;
      fail(error);
      const rows = (data ?? []) as TaskRowRaw[];
      rows.sort(compareTasksByDue);
      const page = pageBounds(f.page, f.size ?? PAGE_SIZE);
      const slice = rows.slice(page.from, page.from + page.n);
      const avatars = await signAvatarPaths(s, slice.flatMap((r) => [r.creator?.avatar_path, ...(r.task_assignees ?? []).map((a) => a.profiles?.avatar_path)]));
      return { items: slice.map((r) => toTaskView(r, avatars)), total: rows.length, page: page.p, size: page.n, counts };
    },
    async countMyOpenTasks() {
      return (await loadNavBadges()).myOpenTasks;
    },
    async getTask(id) {
      const s = await db();
      const { data, error } = await s.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
      fail(error);
      if (!data) return null;
      const row = data as TaskRowRaw;
      const avatars = await signAvatarPaths(s, [row.creator?.avatar_path, ...(row.task_assignees ?? []).map((a) => a.profiles?.avatar_path)]);
      return toTaskView(row, avatars);
    },
    async createTask(input) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const assignee_ids = [...new Set((input.assignee_ids ?? []).filter(Boolean))];
      const row = {
        title: input.title.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        status: input.status ?? "open",
        priority: input.priority ?? "normal",
        due_date: input.due_date || null,
        created_by: user.id,
        project_id: input.project_id || null,
        customer_id: input.customer_id || null,
        service_request_id: input.service_request_id || null,
      };
      const { data, error } = await s.from("tasks").insert(row).select().single();
      fail(error);
      const created = data as Omit<Task, "assignee_ids">;
      await replaceTaskAssignees(s, created.id, assignee_ids);
      await notifyTaskAssigned({ store: supabaseTeamSmsStore(s), actorId: user.id }, { id: created.id, title: created.title, due: created.due_date, addedIds: assignee_ids });
      return { ...created, assignee_ids, email_message_id: created.email_message_id ?? null };
    },
    async updateTask(id, patch) {
      const s = await db();
      const { data: { user } } = await s.auth.getUser();
      const previous = await this.getTask(id);
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title.trim();
      if (patch.description !== undefined) body.description = patch.description?.trim() ? patch.description.trim() : null;
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.priority !== undefined) body.priority = patch.priority;
      if (patch.due_date !== undefined) body.due_date = patch.due_date || null;
      if (patch.project_id !== undefined) body.project_id = patch.project_id || null;
      if (patch.customer_id !== undefined) body.customer_id = patch.customer_id || null;
      if (patch.service_request_id !== undefined) body.service_request_id = patch.service_request_id || null;
      if (Object.keys(body).length) {
        const { data, error } = await s.from("tasks").update(body).eq("id", id).select("id");
        fail(error);
        if (!data?.length) throw new Error("Task not found.");
      }
      if (patch.assignee_ids !== undefined) {
        await replaceTaskAssignees(s, id, patch.assignee_ids);
        const prev = new Set(previous?.assignee_ids ?? []);
        const added = patch.assignee_ids.filter((pid) => !prev.has(pid));
        const next = await this.getTask(id);
        if (next && added.length) {
          await notifyTaskAssigned({ store: supabaseTeamSmsStore(s), actorId: user?.id ?? null }, { id: next.id, title: next.title, due: next.due_date, addedIds: added });
        }
      }
    },
    async deleteTask(id) {
      const { data, error } = await (await db()).from("tasks").delete().eq("id", id).select("id");
      fail(error);
      if (!data?.length) throw new Error("Task not found.");
    },
    async listTaskComments(taskId) {
      const s = await db();
      const { data, error } = await s.from("task_comments")
        .select("id, task_id, author_id, body, created_at, profiles:author_id(full_name, color, avatar_source, avatar_path, google_avatar_url)")
        .eq("task_id", taskId)
        .order("created_at");
      fail(error);
      type Row = { id: string; task_id: string; author_id: string | null; body: string; created_at: string; profiles: (Person & AvatarFields) | null };
      const rows = (data ?? []) as unknown as Row[];
      const avatars = await signAvatarPaths(s, rows.map((r) => r.profiles?.avatar_path));
      return rows.map((r) => {
        const p = r.profiles;
        return {
          id: r.id, task_id: r.task_id, author_id: r.author_id, body: r.body, created_at: r.created_at,
          author_name: p?.full_name ?? "Unknown",
          author_color: p?.color ?? "#64748b",
          author_avatar_url: p ? resolveAvatarUrl(p, p.avatar_path ? avatars.get(p.avatar_path) ?? null : null) : null,
        } satisfies TaskCommentView;
      });
    },
    async addTaskComment(taskId, body) {
      const s = await db();
      const text = body.trim();
      if (!text) throw new Error("A comment is required.");
      const { data, error } = await s.from("task_comments").insert({ task_id: taskId, body: text }).select("id, task_id, author_id, body, created_at").single();
      fail(error);
      const comments = await this.listTaskComments(taskId);
      return comments.find((c) => c.id === (data as { id: string }).id) ?? {
        ...(data as { id: string; task_id: string; author_id: string | null; body: string; created_at: string }),
        author_name: "You", author_color: "#64748b",
      };
    },
    async setTaskEmailMessageId(taskId, messageId) {
      const s = await db();
      const { error } = await s.from("tasks").update({ email_message_id: messageId }).eq("id", taskId).is("email_message_id", null);
      fail(error);
    },

    async setCustomerGeocode(id, patch) {
      fail((await (await db()).from("customers").update(patch).eq("id", id)).error);
    },
    async setServiceRequestGeocode(id, patch) {
      fail((await (await db()).from("service_requests").update(patch).eq("id", id)).error);
    },
  };
}
