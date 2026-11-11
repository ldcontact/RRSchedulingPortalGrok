export type Role = "admin" | "manager" | "tech";
export const ROLES: Role[] = ["admin", "manager", "tech"];
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", tech: "Field Tech" };

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
  /** Raw flag; invited members are false until they have a profile. */
  fleet_access: boolean;
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

export type InviteInput = { email: string; role: Role; full_name: string; title: string | null; phone: string | null; color: string; avatar_source?: AvatarSource; avatar_path?: string | null };

export type SessionUser = { id: string; email: string; name: string; role: Role | null; color: string; active: boolean; avatar_url?: string | null; avatar_source?: AvatarSource; google_avatar_url?: string | null; fleet_access: boolean };

// ---------------------------------------------------------------- phase 2
export type ProjectType = "lighting" | "hvac" | "lighting_hvac" | "other";
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = { lighting: "Lighting", hvac: "HVAC", lighting_hvac: "Lighting + HVAC", other: "Other" };
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
export type JobFilter = { from?: string; to?: string; projectId?: string; assignee?: string; status?: JobStatus[]; serviceRequestId?: string };

export type PhotoKind = "before" | "completion";
export type PhotoRequirement = { id: string; project_id: string; label: string; note: string | null; sort_order: number; created_at: string };
export type Photo = {
  id: string; project_id: string; job_id: string | null; kind: PhotoKind; storage_path: string; caption: string | null;
  requirement_id: string | null; uploaded_by: string | null; uploader_name: string; uploader_color: string; created_at: string; url: string;
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

/** Geotab device ↔ team-member mapping (public.fleet_vehicles). */
export type FleetVehicleRow = { geotab_device_id: string; label: string | null; profile_id: string | null };
