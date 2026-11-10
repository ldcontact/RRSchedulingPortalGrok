import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mergeTeam, type Repo } from "./repo";
import type { AvatarSource, Contact, Customer, CustomerListItem, Job, JobView, Message, Milestone, Note, Person, Photo, PhotoRequirement, Profile, Project, ProjectListItem } from "@/lib/types";
import { addDays, todayKey, zonedToUtc } from "@/lib/time";
import { avatarStorageFolder, resolveAvatarUrl } from "@/lib/avatar";

const iso = (t: string | null) => (t ? new Date(t).toISOString() : t); // normalise "+00:00" -> "Z" so string compares work
const JOB_SELECT = "*, projects!inner(name, type, customer_id, customers(name, address, city, state, zip)), job_assignments(profiles(id, full_name, color, avatar_source, avatar_path, google_avatar_url))";
type JobRow = Job & {
  projects: { name: string; type: Project["type"]; customer_id: string; customers: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null } | null };
  job_assignments: { profiles: Person | null }[];
};
function toJobView(r: JobRow): JobView {
  const { projects: p, job_assignments, ...j } = r;
  const c = p.customers;
  const addr = c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";
  return {
    ...j, starts_at: iso(j.starts_at)!, ends_at: iso(j.ends_at)!, project_name: p.name, project_type: p.type, customer_id: p.customer_id,
    customer_name: c?.name ?? "", address: addr || null, assignees: job_assignments.map((a) => a.profiles).filter((x): x is Person => !!x),
  };
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

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


export function supabaseRepo(): Repo {
  const db = createClient;
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
    async getCustomer(id) {
      const { data, error } = await (await db()).from("customers").select("*").eq("id", id).maybeSingle();
      fail(error);
      return data as Customer | null;
    },
    async createCustomer(input) {
      const { data, error } = await (await db()).from("customers").insert(input).select().single();
      fail(error);
      return data as Customer;
    },
    async updateCustomer(id, input) {
      const { error } = await (await db()).from("customers").update(input).eq("id", id);
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
    async getProfile(id) {
      const s = await db();
      const { data, error } = await s.from("profiles").select("*").eq("id", id).maybeSingle();
      fail(error);
      if (!data) return null;
      return withAvatarUrl(s, data as Profile);
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
      const s = await db();
      const T = todayKey();
      const head = { count: "exact", head: true } as const;
      const [c, t, i, ap, pr, jt, ar] = await Promise.all([
        s.from("customers").select("id", head),
        s.from("profiles").select("id", head).not("role", "is", null).eq("active", true),
        s.from("invites").select("email", head).is("accepted_at", null),
        s.from("projects").select("id", head).in("status", ["scheduled", "in_progress", "awaiting_review"]),
        s.from("projects").select("id", head).eq("status", "proposed"),
        s.from("jobs").select("id", head).neq("status", "cancelled").gte("starts_at", zonedToUtc(T, 0)).lt("starts_at", zonedToUtc(addDays(T, 1), 0)),
        s.from("jobs").select("id", head).eq("status", "completed"),
      ]);
      return { customers: c.count ?? 0, team: t.count ?? 0, invited: i.count ?? 0, activeProjects: ap.count ?? 0, proposed: pr.count ?? 0, jobsToday: jt.count ?? 0, awaitingReview: ar.count ?? 0 };
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
    async getProject(id) {
      const { data, error } = await (await db()).from("projects").select("*").eq("id", id).maybeSingle(); fail(error);
      return data ? { ...(data as Project), value: Number(data.value), est_rebate: Number(data.est_rebate) } : null;
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
      let q = s.from("jobs").select(JOB_SELECT).order("starts_at");
      if (f.from) q = q.gt("ends_at", f.from);
      if (f.to) q = q.lt("starts_at", f.to);
      if (f.projectId) q = q.eq("project_id", f.projectId);
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
      const { data, error } = await s.from("jobs").insert(input).select("id").single(); fail(error);
      if (assignees.length) fail((await s.from("job_assignments").insert([...new Set(assignees)].map((profile_id) => ({ job_id: data!.id, profile_id })))).error);
      return data!.id as string;
    },
    async updateJob(id, patch) {
      const { data, error } = await (await db()).from("jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id"); fail(error);
      if (!data?.length) throw new Error("Job not found or not allowed");
    },
    async setAssignees(jobId, ids) {
      const s = await db();
      const keep = [...new Set(ids)];
      let del = s.from("job_assignments").delete().eq("job_id", jobId);
      if (keep.length) del = del.not("profile_id", "in", `(${keep.join(",")})`);
      fail((await del).error);
      if (keep.length) fail((await s.from("job_assignments").upsert(keep.map((profile_id) => ({ job_id: jobId, profile_id })), { onConflict: "job_id,profile_id", ignoreDuplicates: true })).error);
    },
    async listPhotos(f) {
      const s = await db();
      let q = s.from("photos").select("*").order("created_at");
      if (f.projectId) q = q.eq("project_id", f.projectId);
      if (f.jobId) q = q.eq("job_id", f.jobId);
      if (f.kind) q = q.eq("kind", f.kind);
      const { data, error } = await q; fail(error);
      const rows = (data ?? []) as Omit<Photo, "url">[];
      if (!rows.length) return [];
      const { data: signed } = await s.storage.from("photos").createSignedUrls(rows.map((r) => r.storage_path), 3600);
      const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
      return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? "" }));
    },
    async addPhoto(meta, file) {
      const s = await db();
      const path = `${meta.project_id}/${meta.kind}/${crypto.randomUUID()}.jpg`;
      fail((await s.storage.from("photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false })).error);
      const row = { project_id: meta.project_id, job_id: meta.job_id, kind: meta.kind, caption: meta.caption, requirement_id: meta.requirement_id ?? null, storage_path: path };
      const { error } = await s.from("photos").insert(row);
      if (error) { await s.storage.from("photos").remove([path]); fail(error); }
    },
    async deletePhoto(id) {
      const s = await db();
      const { data } = await s.from("photos").select("storage_path").eq("id", id).maybeSingle();
      fail((await s.from("photos").delete().eq("id", id)).error);
      if (data) await s.storage.from("photos").remove([data.storage_path]);
    },
    async listPhotoRequirements(projectId) {
      const { data, error } = await (await db()).from("project_photo_requirements").select("*").eq("project_id", projectId).order("sort_order").order("created_at");
      fail(error);
      return (data ?? []) as PhotoRequirement[];
    },
    async addPhotoRequirement(projectId, input) {
      const s = await db();
      const { data: maxRow } = await s.from("project_photo_requirements").select("sort_order").eq("project_id", projectId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const sort_order = (maxRow?.sort_order ?? -1) + 1;
      fail((await s.from("project_photo_requirements").insert({ project_id: projectId, label: input.label.trim(), note: input.note, sort_order })).error);
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
        fail((await s.from("project_photo_requirements").update({ sort_order: i }).eq("id", orderedIds[i]).eq("project_id", projectId)).error);
      }
    },
    async listNotes(f) {
      const s = await db();
      let q = s.from("notes").select("*, profiles:author_id(full_name)").order("created_at");
      if (f.jobId) q = q.eq("job_id", f.jobId);
      else if (f.projectId) {
        const { data: js } = await s.from("jobs").select("id").eq("project_id", f.projectId);
        const ids = (js ?? []).map((j) => j.id);
        q = q.or(`project_id.eq.${f.projectId}${ids.length ? `,job_id.in.(${ids.join(",")})` : ""}`);
      }
      const { data, error } = await q; fail(error);
      return ((data ?? []) as (Omit<Note, "author_name"> & { profiles: { full_name: string } | null })[]).map(({ profiles, ...n }) => ({ ...n, author_name: profiles?.full_name ?? "Someone" }));
    },
    async addNote(n) { fail((await (await db()).from("notes").insert({ job_id: n.job_id ?? null, project_id: n.project_id ?? null, customer_id: n.customer_id ?? null, body: n.body })).error); },
    async listMessages(f) {
      let q = (await db()).from("messages").select("*, profiles:sent_by(full_name)").order("created_at", { ascending: false });
      if (f.customerId) q = q.eq("customer_id", f.customerId);
      if (f.projectId) q = q.eq("project_id", f.projectId);
      const { data, error } = await q; fail(error);
      return ((data ?? []) as (Omit<Message, "sender_name"> & { profiles: { full_name: string } | null })[]).map(({ profiles, ...m }) => ({ ...m, sender_name: profiles?.full_name ?? "Someone" }));
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
  };
}
