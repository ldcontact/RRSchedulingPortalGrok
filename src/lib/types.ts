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
};

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
};
export type CustomerInput = Omit<Customer, "id" | "created_at" | "updated_at">;
export type CustomerListItem = Customer & { primary_contact: string | null; project_count: number };

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

export type SessionUser = { id: string; email: string; name: string; role: Role | null; color: string; active: boolean; avatar_url?: string | null; avatar_source?: AvatarSource; google_avatar_url?: string | null };

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

export type Project = {
  id: string; customer_id: string; name: string; type: ProjectType; status: ProjectStatus; scope: string;
  value: number; est_rebate: number; timeline_sent_at: string | null; timeline_sent_via: Channel | null; timeline_approved_at: string | null;
  created_at: string; updated_at: string;
};
export type ProjectInput = Pick<Project, "customer_id" | "name" | "type" | "status" | "scope" | "value" | "est_rebate">;
export type Person = { id: string; full_name: string; color: string; avatar_url?: string | null };
export type ProjectListItem = Project & { customer_name: string; next_visit: string | null; team: Person[]; done_milestones: number; total_milestones: number };

export type Milestone = { id: string; project_id: string; name: string; due_date: string | null; done: boolean; sort_order: number };

export type Job = {
  id: string; project_id: string; title: string; starts_at: string; ends_at: string; status: JobStatus; instructions: string | null;
  started_at: string | null; completed_at: string | null; completed_by: string | null; approved_at: string | null; approved_by: string | null; review_note: string | null;
};
export type JobInput = Pick<Job, "project_id" | "title" | "starts_at" | "ends_at" | "instructions">;
export type JobView = Job & { project_name: string; project_type: ProjectType; customer_id: string; customer_name: string; address: string | null; assignees: Person[] };
export type JobFilter = { from?: string; to?: string; projectId?: string; assignee?: string; status?: JobStatus[] };

export type PhotoKind = "before" | "completion";
export type PhotoRequirement = { id: string; project_id: string; label: string; note: string | null; sort_order: number; created_at: string };
export type Photo = {
  id: string; project_id: string; job_id: string | null; kind: PhotoKind; storage_path: string; caption: string | null;
  requirement_id: string | null; uploaded_by: string | null; created_at: string; url: string;
};
export type Note = { id: string; customer_id: string | null; project_id: string | null; job_id: string | null; body: string; author_id: string | null; author_name: string; created_at: string };
export type Message = {
  id: string; customer_id: string; project_id: string | null; channel: Channel; direction: "outbound" | "inbound";
  subject: string | null; body: string; sent_by: string | null; sender_name: string; created_at: string;
};
export type MessageInput = Pick<Message, "customer_id" | "project_id" | "channel" | "direction" | "subject" | "body">;
export type Counts = { customers: number; team: number; invited: number; activeProjects: number; jobsToday: number; awaitingReview: number; proposed: number };
