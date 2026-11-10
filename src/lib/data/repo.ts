import type {
  Contact, ContactInput, Counts, Customer, CustomerInput, CustomerListItem, CustomerPageFilter, CustomerRow, Paged, ProjectPage, ProjectPageFilter, InviteInput, Job, JobFilter, JobInput, JobView, Message, MessageInput,
  Milestone, Note, Person, Photo, PhotoKind, PhotoRequirement, Profile, Project, ProjectInput, ProjectListItem, ProjectPick, ProjectStatus, TeamMember,
  ServiceRequest, ServiceRequestInput, ServiceRequestPatch, ServiceRequestView, SREvent, SREventKind, SRPage, SRPageFilter,
} from "@/lib/types";

/**
 * Data access used by pages and server actions. Two implementations:
 *  - supabase-repo.ts: real Postgres via Supabase, RLS enforced as the signed-in user
 *  - mock-repo.ts:     DEV MOCK MODE only, a local JSON file (.mock-db.json)
 * Callers also re-check roles before mutating (defense in depth on top of RLS).
 */
export interface Repo {
  listCustomers(q?: string): Promise<CustomerListItem[]>;
  /** Customers tab: one page from the database (range + exact count), search/sort server-side. */
  pageCustomers(f: CustomerPageFilter): Promise<Paged<CustomerRow>>;
  getCustomer(id: string): Promise<Customer | null>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: string, input: CustomerInput): Promise<void>;
  listContacts(customerId: string): Promise<Contact[]>;
  addContact(customerId: string, input: ContactInput): Promise<void>;
  deleteContact(id: string): Promise<void>;

  listTeam(): Promise<TeamMember[]>;
  getProfile(id: string): Promise<Profile | null>;
  upsertInvite(input: InviteInput): Promise<void>;
  removeFromTeam(email: string): Promise<void>;
  setActive(profileId: string, active: boolean): Promise<void>;
  /** Upload or replace a profile picture (admin for anyone; self via updateOwnAvatar). */
  uploadAvatar(target: { email: string; profile_id: string | null }, file: File): Promise<void>;
  /** Switch source to google/none/upload (upload keeps existing path). */
  setAvatarSource(target: { email: string; profile_id: string | null }, source: import("@/lib/types").AvatarSource): Promise<void>;
  removeAvatar(target: { email: string; profile_id: string | null }): Promise<void>;
  /** Current user: refresh google_avatar_url from auth metadata and optionally switch source. */
  syncOwnGoogleAvatar(googleUrl: string | null): Promise<void>;
  updateOwnAvatar(patch: { avatar_source?: import("@/lib/types").AvatarSource; file?: File | null; clear?: boolean }): Promise<void>;
  /** Soft-delete: anonymize PII, strip role, remove invite; keeps FK history. */
  softDeleteMember(profileId: string, actorId: string): Promise<{ email: string; full_name: string }>;
  writeAdminAudit(row: { actor_id: string; action: string; target_email?: string | null; target_profile_id?: string | null; detail?: Record<string, unknown> }): Promise<void>;
  countActiveAdmins(): Promise<number>;

  counts(): Promise<Counts>;

  // ---- phase 2
  listProjects(f?: { status?: ProjectStatus; customerId?: string; q?: string }): Promise<ProjectListItem[]>;
  /** Projects tab: one page from the database (range + exact count) plus per-status counts for the same search. */
  pageProjects(f: ProjectPageFilter): Promise<ProjectPage>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Omit<Project, "id" | "created_at" | "updated_at">>): Promise<void>;
  listMilestones(projectId: string): Promise<Milestone[]>;
  addMilestone(projectId: string, m: { name: string; due_date: string | null }): Promise<void>;
  updateMilestone(id: string, patch: Partial<Pick<Milestone, "name" | "due_date" | "done">>): Promise<void>;
  deleteMilestone(id: string): Promise<void>;
  /** Active team members who can be put on a job (techs first). */
  listAssignable(): Promise<(Person & { role: string })[]>;
  listJobs(f?: JobFilter): Promise<JobView[]>;
  getJob(id: string): Promise<JobView | null>;
  createJob(input: JobInput, assignees: string[]): Promise<string>;
  updateJob(id: string, patch: Partial<Omit<Job, "id">>): Promise<void>;
  setAssignees(jobId: string, profileIds: string[]): Promise<void>;
  listPhotos(f: { projectId?: string; jobId?: string; kind?: PhotoKind }): Promise<Photo[]>;
  addPhoto(meta: { project_id: string; job_id: string | null; kind: PhotoKind; caption: string | null; requirement_id?: string | null }, file: File): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  listPhotoRequirements(projectId: string): Promise<PhotoRequirement[]>;
  addPhotoRequirement(projectId: string, input: { label: string; note: string | null }): Promise<void>;
  updatePhotoRequirement(id: string, patch: Partial<Pick<PhotoRequirement, "label" | "note" | "sort_order">>): Promise<void>;
  deletePhotoRequirement(id: string): Promise<void>;
  reorderPhotoRequirements(projectId: string, orderedIds: string[]): Promise<void>;
  listNotes(f: { jobId?: string; projectId?: string }): Promise<Note[]>;
  addNote(n: { job_id?: string; project_id?: string; customer_id?: string; body: string }): Promise<void>;
  listMessages(f: { customerId?: string; projectId?: string }): Promise<Message[]>;
  logMessage(m: MessageInput): Promise<void>;

  // ---- service requests (tickets). Staff only, except getServiceRequest for the tech on its visit.
  /** Inbox: one page (50) from the database plus per-status-tab counts for the same filters. */
  pageServiceRequests(f: SRPageFilter): Promise<SRPage>;
  /** new + triaged + scheduled (sidebar badge). */
  countOpenServiceRequests(): Promise<number>;
  getServiceRequest(id: string): Promise<ServiceRequestView | null>;
  /** Creates the ticket and its "created" history entry. */
  createServiceRequest(input: ServiceRequestInput): Promise<ServiceRequest>;
  updateServiceRequest(id: string, patch: ServiceRequestPatch): Promise<void>;
  listServiceRequestEvents(requestId: string): Promise<SREvent[]>;
  addServiceRequestEvent(requestId: string, e: { kind: SREventKind; body: string }): Promise<void>;
  /** Bounded project search for the link picker / suggested original project (never unbounded; max 25). */
  findProjects(f: { q?: string; customerId?: string; limit?: number }): Promise<ProjectPick[]>;
}

/** Jobs in `jobs` (not cancelled) that overlap [starts, ends) for any of `people`, excluding `exceptJob`. */
export function findConflicts(jobs: JobView[], people: string[], starts: string, ends: string, exceptJob?: string) {
  const out: { person: Person; job: JobView }[] = [];
  for (const j of jobs) {
    if (j.id === exceptJob || j.status === "cancelled") continue;
    if (!(j.starts_at < ends && starts < j.ends_at)) continue;
    for (const a of j.assignees) if (people.includes(a.id)) out.push({ person: a, job: j });
  }
  return out;
}

export async function getRepo(): Promise<Repo> {
  const { MOCK_MODE, assertMockAllowed } = await import("@/lib/env");
  if (MOCK_MODE) {
    assertMockAllowed();
    return (await import("./mock-repo")).mockRepo;
  }
  return (await import("./supabase-repo")).supabaseRepo();
}

/** Merge signed-up profiles with the admin-managed invite list into one team view. */
export function mergeTeam(
  profiles: Profile[],
  invites: { email: string; role: TeamMember["role"]; full_name: string; title: string | null; phone: string | null; color: string; avatar_source?: TeamMember["avatar_source"]; avatar_path?: string | null; invited_at: string; accepted_at: string | null }[],
): TeamMember[] {
  const byEmail = new Map<string, TeamMember>();
  for (const p of profiles) {
    if (!p.role && !invites.some((i) => i.email === p.email)) continue; // signed in but not on the team list
    byEmail.set(p.email, {
      email: p.email, full_name: p.full_name, role: p.role, title: p.title, phone: p.phone, color: p.color,
      profile_id: p.id, status: p.active ? "active" : "inactive", invited_at: null,
      avatar_source: p.avatar_source ?? "none", avatar_path: p.avatar_path ?? null,
      google_avatar_url: p.google_avatar_url ?? null, avatar_url: p.avatar_url ?? null,
    });
  }
  for (const i of invites) {
    const existing = byEmail.get(i.email);
    if (existing) {
      existing.invited_at = i.invited_at;
      // Prefer live profile avatar; fill from invite only if profile has none
      if ((existing.avatar_source ?? "none") === "none" && i.avatar_source && i.avatar_source !== "none") {
        existing.avatar_source = i.avatar_source;
        existing.avatar_path = i.avatar_path ?? null;
      }
      continue;
    }
    byEmail.set(i.email, {
      email: i.email, full_name: i.full_name, role: i.role, title: i.title, phone: i.phone, color: i.color,
      profile_id: null, status: "invited", invited_at: i.invited_at,
      avatar_source: i.avatar_source ?? "none", avatar_path: i.avatar_path ?? null,
      google_avatar_url: null, avatar_url: null,
    });
  }
  const order = { admin: 0, manager: 1, tech: 2 } as const;
  return [...byEmail.values()].sort((a, b) => (order[a.role ?? "tech"] - order[b.role ?? "tech"]) || a.full_name.localeCompare(b.full_name));
}

/**
 * Same Supabase repo as getRepo(), but acting as the owner of a Supabase access token
 * (used by /api/mcp, which has no cookies). RLS stays in force; never the service role.
 */
export async function getRepoForToken(accessToken: string): Promise<Repo> {
  const [{ supabaseRepo }, { createTokenClient }] = await Promise.all([import("./supabase-repo"), import("@/lib/supabase/token")]);
  const client = createTokenClient(accessToken);
  return supabaseRepo(async () => client);
}
