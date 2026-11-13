export type Role = "admin" | "manager" | "sales" | "tech";
export const ROLES: Role[] = ["admin", "manager", "sales", "tech"];
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", sales: "Sales", tech: "Field Tech" };

export type AvatarSource = "none" | "upload" | "google";
export const AVATAR_SOURCES: AvatarSource[] = ["none", "upload", "google"];

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  title: string | null;
  color: string;
  role: Role | null;
  active: boolean;
  avatar_source: AvatarSource;
  avatar_path: string | null;
  google_avatar_url: string | null;
  /** Resolved display URL (signed upload or Google); set by repos, not stored. */
  avatar_url?: string | null;
  deleted_at?: string | null;
  /** Admin-granted Geotab access. Admins always have access even when this is false. */
  fleet_access: boolean;
  /** Admin-granted delete access. Admins always have it; techs never do, even when this is true. */
  can_delete: boolean;
};

export type Invite = {
  email: string;
  role: Role;
  full_name: string;
  phone: string | null;
  title: string | null;
  color: string;
  avatar_source: AvatarSource;
  avatar_path: string | null;
  invited_at: string;
  accepted_at: string | null;
  fleet_access: boolean;
  can_delete: boolean;
};

export type TeamMember = {
  email: string;
  full_name: string;
  role: Role | null;
  title: string | null;
  phone: string | null;
  color: string;
  profile_id: string | null;
  status: "active" | "invited" | "inactive";
  invited_at: string | null;
  avatar_source: AvatarSource;
  avatar_path: string | null;
  google_avatar_url: string | null;
  avatar_url?: string | null;
  /** Raw flag from the profile, or from the invite before first sign-in. */
  fleet_access: boolean;
  /** Raw flag from the profile, or from the invite before first sign-in. */
  can_delete: boolean;
};

export type GeocodeStatus = "matched" | "no_match" | "tie" | "error";
export type GeocodeFields = { lat: number | null; lng: number | null; geocoded_at: string | null; geocode_status: GeocodeStatus | null };

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
} & GeocodeFields;
export type CustomerInput = Omit<Customer, "id" | "created_at" | "updated_at" | "lat" | "lng" | "geocoded_at" | "geocode_status">;
export type CustomerListItem = Customer & { primary_contact: string | null; project_count: number };

// ---- paged list views (one database page at a time; only the columns the row shows)
/** Customers and Projects list pages (pager uses this size so page count and "Showing x–y of z" stay correct). */
export const LIST_PAGE_SIZE = 25;
/** Default page size for other paged lists (tasks, service requests, MCP). */
export const PAGE_SIZE = 50;
export type Paged<T> = { items: T[]; total: number; page: number; size: number };
export type CustomerSort = "name" | "name_desc" | "newest";
export type CustomerRow = Pick<Customer, "id" | "name" | "phone" | "email" | "address" | "city" | "state" | "zip" | "tags"> & { primary_contact: string | null };
export type CustomerPageFilter = { q?: string; page: number; size?: number; sort?: CustomerSort };

export type Contact = {
  id: string;
  customer_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
};
export type ContactInput = Omit<Contact, "id" | "customer_id">;

export type InviteInput = { email: string; role: Role; full_name: string; title: string | null; phone: string | null; color: string; avatar_source?: AvatarSource; avatar_path?: string | null; fleet_access?: boolean; can_delete?: boolean };

export type SessionUser = { id: string; email: string; name: string; role: Role | null; color: string; active: boolean; avatar_url?: string | null; avatar_source?: AvatarSource; google_avatar_url?: string | null; fleet_access: boolean; can_delete: boolean };

// ---------------------------------------------------------------- phase 2
/** Canonical order for pickers, filters, and Fleet job-type chips. `lighting` is stored as-is (relabel only). */
export const PROJECT_TYPES = [
  "lighting",
  "hvac",
  "lighting_hvac",
  "whe_single_family",
  "whe_multifamily",
  "ac",
  "ptac_to_hpac",
  "weatherization",
  "pipe_insulation",
  "steam_traps",
  "boiler_tune_up",
  "hot_water_controllers",
  "audit",
  "other",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  lighting: "LED Lighting",
  hvac: "HVAC",
  lighting_hvac: "Lighting + HVAC",
  whe_single_family: "Whole Home Electric – Single Family",
  whe_multifamily: "Whole Home Electric – Multifamily",
  ac: "AC",
  ptac_to_hpac: "PTAC to HPAC",
  weatherization: "Weatherization",
  pipe_insulation: "Pipe Insulation",
  steam_traps: "Steam Traps",
  boiler_tune_up: "Boiler Tune Up",
  hot_water_controllers: "Hot Water Controllers",
  audit: "Audit",
  other: "Other",
};
export type ProjectStatus = "proposed" | "scheduled" | "in_progress" | "awaiting_review" | "complete" | "cancelled";
export const PROJECT_STATUSES: ProjectStatus[] = ["proposed", "scheduled", "in_progress", "awaiting_review", "complete", "cancelled"];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  proposed: "Proposed", scheduled: "Scheduled", in_progress: "In progress", awaiting_review: "Awaiting review", complete: "Complete", cancelled: "Cancelled",
};
export type JobStatus = "scheduled" | "in_progress" | "completed" | "approved" | "cancelled";
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: "Scheduled", in_progress: "In progress", completed: "Awaiting review", approved: "Approved", cancelled: "Cancelled",
};
export type Channel = "call" | "text" | "email" | "timeline" | "note";
export const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", text: "Text", email: "Email", timeline: "Proposed timeline", note: "Note" };

/** Default warranty window, in months from the project's completion. */
export const DEFAULT_WARRANTY_MONTHS = 12;

export type Project = {
  id: string; customer_id: string; name: string; type: ProjectType; status: ProjectStatus; scope: string;
  value: number; est_rebate: number; timeline_sent_at: string | null; timeline_sent_via: Channel | null; timeline_approved_at: string | null;
  /** Warranty window in months from the project's completion (DEFAULT_WARRANTY_MONTHS). */
  warranty_months: number;
  /** Housecall Pro job number when the project was imported; used in workspace and list search. */
  hcp_job_number?: string | null;
  site_address?: string | null; site_city?: string | null; site_state?: string | null; site_zip?: string | null;
  created_at: string; updated_at: string;
};
export type ProjectInput = Pick<Project, "customer_id" | "name" | "type" | "status" | "scope" | "value" | "est_rebate"> & { warranty_months?: number };
export type Person = { id: string; full_name: string; color: string; avatar_url?: string | null };
export type ProjectListItem = Project & { customer_name: string; next_visit: string | null; team: Person[]; done_milestones: number; total_milestones: number };
export type ProjectSort = "updated" | "newest" | "name" | "value";
export type ProjectRow = Pick<Project, "id" | "name" | "type" | "status" | "value" | "est_rebate" | "updated_at"> & {
  customer_name: string; address: string; start_date: string | null; completed_date: string | null; next_visit: string | null; team: Person[]; done_milestones: number; total_milestones: number;
};
/** status: a single status, or undefined = all except cancelled ("All active"). */
export type ProjectPageFilter = { q?: string; status?: ProjectStatus; page: number; size?: number; sort?: ProjectSort };
/** counts: matching projects per status tab (same search), key "active" = all but cancelled. */
export type ProjectPage = Paged<ProjectRow> & { counts: Record<string, number>; note?: string };

export type Milestone = { id: string; project_id: string; name: string; due_date: string | null; done: boolean; sort_order: number };

/** install = the sold retrofit work; warranty/service = follow-up visits from a service request. */
export type JobKind = "install" | "warranty" | "service";
export const JOB_KIND_LABEL: Record<JobKind, string> = { install: "Install", warranty: "Warranty", service: "Service" };
export type Job = {
  id: string; project_id: string; title: string; starts_at: string; ends_at: string; status: JobStatus; instructions: string | null;
  started_at: string | null; completed_at: string | null; completed_by: string | null; approved_at: string | null; approved_by: string | null; review_note: string | null;
  kind: JobKind; service_request_id: string | null;
};
export type JobInput = Pick<Job, "project_id" | "title" | "starts_at" | "ends_at" | "instructions"> & { kind?: JobKind; service_request_id?: string | null };
export type JobView = Job & { project_name: string; project_type: ProjectType; customer_id: string; customer_name: string; address: string | null; assignees: Person[]; latitude: number | null; longitude: number | null };
/** Max rows for the staff Home / MCP "awaiting review" list. The badge uses counts().awaitingReview. */
export const HOME_REVIEW_LIMIT = 50;
export type JobFilter = {
  from?: string; to?: string; projectId?: string; customerId?: string; assignee?: string;
  status?: JobStatus[]; serviceRequestId?: string;
  /** Cap the result (PostgREST also caps a single select at 1,000). */
  limit?: number;
  /** Default is starts_at ascending. completed_at is newest-first (review queue). */
  order?: "starts_at" | "completed_at";
};

export type PhotoKind = "before" | "completion";
/** Visit/project photo category. kind stays before|completion for existing RLS and storage paths. */
export type PhotoPhase = "before" | "after" | "required" | "other";
export type PhotoRequirement = { id: string; project_id: string; job_id: string | null; label: string; note: string | null; sort_order: number; created_at: string };
export type Photo = {
  id: string; project_id: string; job_id: string | null; kind: PhotoKind; phase: PhotoPhase; storage_path: string; caption: string | null;
  requirement_id: string | null; uploaded_by: string | null; uploader_name: string; uploader_color: string; created_at: string; url: string;
};
export type ProjectFile = {
  id: string;
  project_id: string;
  job_id: string | null;
  filename: string;
  mime: string;
  size_bytes: number;
  storage_path: string;
  uploaded_by: string | null;
  uploader_name: string;
  created_at: string;
  url: string;
  download_url: string;
};

export type Note = {
  id: string; customer_id: string | null; project_id: string | null; job_id: string | null; body: string;
  author_id: string | null; author_name: string; author_color: string; created_at: string;
};
export type Message = {
  id: string; customer_id: string; project_id: string | null; channel: Channel; direction: "outbound" | "inbound";
  subject: string | null; body: string; sent_by: string | null; sender_name: string; sender_color: string; created_at: string;
};
export type MessageInput = Pick<Message, "customer_id" | "project_id" | "channel" | "direction" | "subject" | "body">;
export type Counts = { customers: number; team: number; invited: number; activeProjects: number; jobsToday: number; awaitingReview: number; proposed: number };

// ---------------------------------------------------------------- service requests (tickets)
export type SRStatus = "new" | "triaged" | "scheduled" | "resolved" | "closed" | "converted";
export const SR_STATUSES: SRStatus[] = ["new", "triaged", "scheduled", "resolved", "closed", "converted"];
export const SR_OPEN: SRStatus[] = ["new", "triaged", "scheduled"];
export const SR_STATUS_LABEL: Record<SRStatus, string> = { new: "New", triaged: "Triaged", scheduled: "Scheduled", resolved: "Resolved", closed: "Closed", converted: "Converted" };
export type SRChannel = "call" | "email" | "other";
export const SR_CHANNEL_LABEL: Record<SRChannel, string> = { call: "Phone call", email: "Email", other: "Other" };
export type SRPriority = "low" | "normal" | "high";
export const SR_PRIORITY_LABEL: Record<SRPriority, string> = { low: "Low", normal: "Normal", high: "High" };
export type WarrantyState = "in" | "out" | "unknown";
export const WARRANTY_LABEL: Record<WarrantyState, string> = { in: "In warranty", out: "Out of warranty", unknown: "Unknown" };

export type ServiceRequest = {
  id: string; number: number; customer_id: string; project_id: string | null;
  site_address: string | null; site_city: string | null; site_state: string | null; site_zip: string | null;
  contact_name: string | null; contact_phone: string | null; contact_email: string | null;
  channel: SRChannel; received_at: string; summary: string; description: string; priority: SRPriority; status: SRStatus;
  billable: boolean; assignee_id: string | null; converted_project_id: string | null;
  resolved_at: string | null; resolved_by: string | null; resolved_job_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
} & GeocodeFields;
/** Crew on the ticket's next upcoming service/warranty visit, or the latest visit if none are upcoming. */
export type TicketVisitCrew = {
  job_id: string; starts_at: string; status: JobStatus; kind: JobKind; techs: Person[];
};
/** A ticket row as the inbox and detail page show it (public.service_request_list). */
export type ServiceRequestView = ServiceRequest & {
  customer_name: string; project_name: string | null; project_type: ProjectType | null; project_status: ProjectStatus | null;
  warranty_months: number | null; project_completed_at: string | null; warranty_expires_at: string | null; warranty_state: WarrantyState;
  assignee_name: string | null; assignee_color: string | null;
  /** Present on inbox pages after a batched visit-crew lookup. Null = no visit yet. */
  visit?: TicketVisitCrew | null;
};
export type ServiceRequestInput = Pick<ServiceRequest, "customer_id" | "project_id" | "site_address" | "site_city" | "site_state" | "site_zip"
  | "contact_name" | "contact_phone" | "contact_email" | "channel" | "received_at" | "summary" | "description" | "priority"> & {
  /** Office owner. The create action defaults this to the person who logged the ticket. */
  assignee_id?: string | null;
};
export type ServiceRequestPatch = Partial<Pick<ServiceRequest, "project_id" | "status" | "billable" | "assignee_id" | "converted_project_id" | "resolved_at" | "resolved_by" | "resolved_job_id" | "priority">>;
export const ticketNo = (n: number) => `SR-${n}`;
export type SREventKind = "created" | "note" | "status" | "linked" | "unlinked" | "assigned" | "billable" | "scheduled" | "converted" | "resolved" | "closed" | "reopened";
export type SREvent = { id: string; request_id: string; kind: SREventKind; body: string; actor_id: string | null; actor_name: string; actor_color: string; created_at: string };
/** status: one status, "open" (new+triaged+scheduled, the default), or "all". */
export type SRPageFilter = {
  q?: string; status?: SRStatus | "open" | "all"; channel?: SRChannel; warranty?: WarrantyState; assignee?: string | "none"; page: number; size?: number;
};
/** counts: per status tab for the same search/filters, plus "open" and "all". */
export type SRPage = Paged<ServiceRequestView> & { counts: Record<string, number> };
/** A project as the link picker / "suggested original project" shows it. */
export type ProjectPick = {
  id: string; name: string; type: ProjectType; status: ProjectStatus; customer_id: string; customer_name: string;
  completed_at: string | null; warranty_months: number;
};
/** Slim project row for the Schedule-a-visit typeahead (no jobs, milestones, or HCP extra JSON). */
export type ProjectHit = {
  id: string; name: string; customer_name: string; status: ProjectStatus; hcp_job_number?: string | null;
};

/** Geotab device ↔ team-member mapping (public.fleet_vehicles). */
export type FleetVehicleRow = { geotab_device_id: string; label: string | null; profile_id: string | null };

// ---------------------------------------------------------------- tasks
export type TaskStatus = "open" | "in_progress" | "done";
export const TASK_STATUSES: TaskStatus[] = ["open", "in_progress", "done"];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { open: "Open", in_progress: "In progress", done: "Done" };
/** Open + in progress (not done). Used by the default list filter and the nav badge. */
export const TASK_ACTIVE: TaskStatus[] = ["open", "in_progress"];
export type TaskPriority = "low" | "normal" | "high";
export const TASK_PRIORITIES: TaskPriority[] = ["low", "normal", "high"];
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High" };
export type TaskDueFilter = "overdue" | "today" | "upcoming" | "none";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_ids: string[];
  created_by: string;
  project_id: string | null;
  customer_id: string | null;
  service_request_id: string | null;
  completed_at: string | null;
  /** RFC Message-ID of the first notification, used to thread later emails. */
  email_message_id: string | null;
  created_at: string;
  updated_at: string;
};
export type TaskInput = Pick<Task, "title" | "description" | "status" | "priority" | "due_date" | "assignee_ids" | "project_id" | "customer_id" | "service_request_id">;
export type TaskPatch = Partial<TaskInput>;
export type TaskView = Task & {
  assignees: Person[];
  creator: Person;
  project_name: string | null;
  customer_name: string | null;
  service_request_number: number | null;
  service_request_summary: string | null;
};
export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};
export type TaskCommentView = TaskComment & {
  author_name: string;
  author_color: string;
  author_avatar_url?: string | null;
};
export type TaskTab = "mine" | "all";
export type TaskPageFilter = {
  tab?: TaskTab;
  q?: string;
  status?: TaskStatus | "active";
  assignee?: string | "none";
  due?: TaskDueFilter;
  projectId?: string;
  customerId?: string;
  page: number;
  size?: number;
};
export type TaskPage = Paged<TaskView> & { counts: Record<string, number> };

/** One row in the Quick Find modal. */
export type WorkspaceSearchHit = {
  id: string;
  kind: "customer" | "project" | "person";
  title: string;
  subtitle: string;
  href: string | null;
};
export type WorkspaceSearchGroup = { items: WorkspaceSearchHit[]; total: number };
export type WorkspaceSearchResults = {
  customers: WorkspaceSearchGroup;
  projects: WorkspaceSearchGroup;
  people: WorkspaceSearchGroup;
};
