import "server-only";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { mergeTeam, type Repo } from "./repo";
import { customerSearchFields, matchesSearch, parseSearch, projectSearchFields } from "@/lib/search";
import type { Contact, Customer, FleetVehicleRow, GeocodeFields, Invite, Job, JobView, Message, Milestone, Note, Photo, PhotoRequirement, Profile, Project, ProjectPick, ProjectStatus, ServiceRequest, ServiceRequestView, SREvent, SRPageFilter } from "@/lib/types";
import { DEFAULT_WARRANTY_MONTHS, PAGE_SIZE, PROJECT_STATUSES, SR_OPEN, SR_STATUSES } from "@/lib/types";
import { formatAddress, projectDates, warrantyFor } from "@/lib/project-row";
import { resolveAvatarUrl } from "@/lib/avatar";
import { authorColor, authorLabel } from "@/lib/author";
import { addDays, dayKey, todayKey, zonedToUtc } from "@/lib/time";
import { applyTicketVisits } from "@/lib/tickets";
import { SAMPLE_DEFAULT_MAP } from "@/lib/geotab/sample";
import { hasFleetAccess } from "@/lib/geotab/access";
import { addressChanged, emptyGeocode, visitCoords } from "@/lib/geocode/parse";

/*
 * DEV MOCK MODE data layer. Persists to .mock-db.json in the project root
 * (git-ignored). Delete that file to reset the sample data. Never used when
 * NEXT_PUBLIC_RR_MOCK_MODE is unset.
 */
type PhotoRow = Omit<Photo, "url" | "uploader_name" | "uploader_color">;
type NoteRow = Omit<Note, "author_name" | "author_color">;
type MessageRow = Omit<Message, "sender_name" | "sender_color">;
type P2 = { projects: Project[]; milestones: Milestone[]; jobs: Job[]; assignments: { job_id: string; profile_id: string }[]; photos: PhotoRow[]; notes: NoteRow[]; messages: MessageRow[]; photo_requirements: PhotoRequirement[] };
type SREventRow = Omit<SREvent, "actor_name" | "actor_color">;
type SR = { service_requests: ServiceRequest[]; sr_events: SREventRow[] };
type MockProfile = Profile & { deleted_at?: string | null };
type AuditRow = { id: string; actor_id: string; action: string; target_email: string | null; target_profile_id: string | null; detail: Record<string, unknown>; created_at: string };
type DB = { profiles: MockProfile[]; invites: Invite[]; customers: Customer[]; contacts: Contact[]; admin_audit: AuditRow[]; fleet_vehicles: FleetVehicleRow[] } & P2 & SR;
export const MOCK_UPLOADS = join(process.cwd(), ".mock-uploads");
const FILE = join(process.cwd(), ".mock-db.json");

/** Census Geocoder results (Public_AR_Current, 2026-11-11) for the sample customer addresses. */
const CENSUS_AT = "2026-11-11T15:45:00.000Z";
const CENSUS_SEED: Record<string, GeocodeFields> = {
  c1: { lat: 42.05564871268, lng: -87.999730840348, geocoded_at: CENSUS_AT, geocode_status: "matched" },
  c2: { lat: 42.048335210405, lng: -88.100787329604, geocoded_at: CENSUS_AT, geocode_status: "matched" },
  c3: { lat: 42.111750364075, lng: -88.046276782448, geocoded_at: CENSUS_AT, geocode_status: "matched" },
  c4: { lat: 42.002294921649, lng: -87.948362438668, geocoded_at: CENSUS_AT, geocode_status: "matched" },
  c5: { lat: null, lng: null, geocoded_at: CENSUS_AT, geocode_status: "no_match" }, // 1600 W Higgins Rd did not match
  c6: { lat: 42.079082186161, lng: -88.02292446097, geocoded_at: CENSUS_AT, geocode_status: "matched" },
  c7: { lat: 41.971354670264, lng: -88.020444520251, geocoded_at: CENSUS_AT, geocode_status: "matched" },
  c8: { lat: 41.986558490764, lng: -88.085092482722, geocoded_at: CENSUS_AT, geocode_status: "matched" },
};
function withGeocode<T extends { id: string }>(row: T, table: "customer" | "sr" = "customer"): T & GeocodeFields {
  const g = CENSUS_SEED[row.id] ?? (table === "sr" ? CENSUS_SEED[(row as { customer_id?: string }).customer_id ?? ""] : undefined);
  return { ...row, ...(g ?? emptyGeocode()) };
}



const now = () => new Date().toISOString();
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

function seed(): DB {
  const p = (id: string, email: string, full_name: string, role: Profile["role"], title: string, phone: string, color: string, avatar?: Partial<Pick<Profile, "avatar_source" | "avatar_path" | "google_avatar_url">>): MockProfile =>
    ({ id, email, full_name, role, title, phone, color, active: true, avatar_source: avatar?.avatar_source ?? "none", avatar_path: avatar?.avatar_path ?? null, google_avatar_url: avatar?.google_avatar_url ?? null, deleted_at: null, fleet_access: false });
  const profiles = [
    p("u-admin", "luke@retrofitrebates.com", "Luke Dlugosz", "admin", "Owner / President", "(847) 555-0100", "#0f766e", { avatar_source: "google", google_avatar_url: "/api/mock-photo/seed/avatar/Luke%20Dlugosz.svg" }),
    p("u-manager", "maria.santos@gmail.com", "Maria Santos", "manager", "Operations Manager", "(847) 555-0101", "#7c3aed", { avatar_source: "upload", avatar_path: "seed/avatar/Maria%20Santos.svg" }),
    p("u-tech1", "carlos.mendez@yahoo.com", "Carlos Mendez", "tech", "Lead Electrician", "(847) 555-0102", "#ea580c", { avatar_source: "google", google_avatar_url: "/api/mock-photo/seed/avatar/Carlos%20Mendez.svg" }),
    p("u-tech2", "jake.sullivan@gmail.com", "Jake Sullivan", "tech", "Electrician", "(847) 555-0103", "#2563eb"),
    p("u-tech3", "andre.w@outlook.com", "Andre Williams", "tech", "HVAC Technician", "(847) 555-0104", "#db2777"),
    p("u-tech4", "emily.chen@icloud.com", "Emily Chen", "tech", "Electrician", "(847) 555-0105", "#16a34a", { avatar_source: "upload", avatar_path: "seed/avatar/Emily%20Chen.svg" }),
    p("u-stranger", "someone.else@gmail.com", "Someone Else", null, "", "", "#64748b"),
  ];
  const invites: Invite[] = profiles.filter((x) => x.role).map((x) => ({
    email: x.email, role: x.role!, full_name: x.full_name, phone: x.phone, title: x.title, color: x.color,
    avatar_source: x.avatar_source, avatar_path: x.avatar_path, invited_at: ago(40), accepted_at: ago(39),
  }));
  invites.push({ email: "sam.ortiz@gmail.com", role: "tech", full_name: "Sam Ortiz", phone: "(630) 555-0177", title: "Apprentice Electrician", color: "#0891b2", avatar_source: "none", avatar_path: null, invited_at: ago(1), accepted_at: null });
  const c = (id: string, name: string, phone: string, email: string, address: string, city: string, zip: string, tags: string[], notes: string, days: number): Customer =>
    ({ id, name, phone, email, address, city, state: "IL", zip, tags, notes, created_at: ago(days), updated_at: ago(days), ...emptyGeocode() });
  const customers = [
    c("c1", "Lakeview Family Dental", "(847) 555-0141", "office@lakeviewdental.example", "1420 W Algonquin Rd", "Arlington Heights", "60005", ["ComEd SB", "Lighting"], "Office manager is Janet. Prefers texts. Closes 1pm Fridays.", 60),
    c("c2", "Golf Road Auto Body", "(847) 555-0152", "tony@golfrdautobody.example", "905 E Golf Rd", "Schaumburg", "60173", ["ComEd SB", "Lighting"], "Shop opens 7am. Bay 4 is clear for the lift.", 45),
    c("c3", "Prairie Bean Coffee Co.", "(847) 555-0163", "megan@prairiebean.example", "38 N Brockway St", "Palatine", "60067", ["ComEd SB", "HVAC"], "Roof access via rear ladder; lockbox code with Maria.", 30),
    c("c4", "Elk Grove Precision Machining", "(847) 555-0174", "dkowalski@egprecision.example", "2250 Lunt Ave", "Elk Grove Village", "60007", ["ComEd SB", "Lighting", "Large"], "Safety glasses and steel toes required on the floor.", 40),
    c("c5", "Hoffman Estates Self Storage", "(847) 555-0185", "linda@hestorage.example", "1600 W Higgins Rd", "Hoffman Estates", "60169", ["ComEd SB", "Lighting"], "Gate code 4417#. Buildings A–E.", 25),
    c("c6", "Northwest Fitness Studio", "(847) 555-0196", "jamal@nwfitness.example", "3315 Kirchoff Rd", "Rolling Meadows", "60008", ["Lead", "HVAC"], "Wants HVAC tune-up + lighting assessment. Busy 5–8pm.", 6),
    c("c7", "Itasca Print & Sign", "(630) 555-0127", "rosa@itascaprint.example", "510 W Irving Park Rd", "Itasca", "60143", ["Lead"], "Referred by Golf Road Auto Body.", 3),
    c("c8", "Roselle Family Pharmacy", "(630) 555-0138", "ken@rosellerx.example", "122 E Irving Park Rd", "Roselle", "60172", ["Lead", "Lighting"], "Asked about the free ComEd assessment.", 2),
  ].map((row) => withGeocode(row));
  const k = (customer_id: string, name: string, title: string, phone: string, email: string, is_primary = true): Contact =>
    ({ id: randomUUID(), customer_id, name, title, phone, email, is_primary });
  const contacts = [
    k("c1", "Dr. Priya Nair", "Owner", "(847) 555-0141", "priya@lakeviewdental.example"),
    k("c1", "Janet Brooks", "Office Manager", "(847) 555-0142", "office@lakeviewdental.example", false),
    k("c2", "Tony Russo", "Owner", "(847) 555-0152", "tony@golfrdautobody.example"),
    k("c3", "Megan Holt", "Owner", "(847) 555-0163", "megan@prairiebean.example"),
    k("c4", "Dave Kowalski", "Plant Manager", "(847) 555-0174", "dkowalski@egprecision.example"),
    k("c5", "Linda Park", "Property Manager", "(847) 555-0185", "linda@hestorage.example"),
    k("c6", "Jamal Carter", "Owner", "(847) 555-0196", "jamal@nwfitness.example"),
    k("c7", "Rosa Delgado", "Owner", "(630) 555-0127", "rosa@itascaprint.example"),
    k("c8", "Ken Yamamoto", "Pharmacist / Owner", "(630) 555-0138", "ken@rosellerx.example"),
  ];
  const maria = profiles.find((x) => x.id === "u-manager");
  if (maria) maria.fleet_access = true; // operations manager — used for manager fleet demos
  const fleet_vehicles: FleetVehicleRow[] = SAMPLE_DEFAULT_MAP.map((m) => ({ ...m }));
  const db = { profiles, invites, customers, contacts, admin_audit: [], fleet_vehicles, ...seedPhase2(), service_requests: [], sr_events: [] } as DB;
  seedServiceRequests(db);
  return db;
}

/** Sample projects/visits placed around today so the schedule always has something to show. */
function seedPhase2(): P2 {
  const T = todayKey();
  const at = (dayOffset: number, h: number, m = 0) => zonedToUtc(addDays(T, dayOffset), h * 60 + m);
  const pr = (id: string, customer_id: string, name: string, type: Project["type"], scope: string, value: number, est_rebate: number, extra: Partial<Project> = {}): Project => ({
    id, customer_id, name, type, status: "proposed", scope, value, est_rebate, timeline_sent_at: null, timeline_sent_via: null, timeline_approved_at: null,
    warranty_months: DEFAULT_WARRANTY_MONTHS, created_at: ago(20), updated_at: ago(1), ...extra,
  });
  const projects = [
    pr("p1", "c1", "LED retrofit – full office", "lighting",
      "Replace 42 (2x4) T8 troffers with 40W LED flat panels in lobby, 6 operatories and hallway.\nInstall 4 occupancy sensors in break room and restrooms.\nRecycle old lamps/ballasts (ComEd requirement). Work around patient hours; operatories 3 & 4 only after 1pm Friday.",
      18400, 9200, { timeline_sent_at: ago(12), timeline_sent_via: "email", timeline_approved_at: ago(10) }),
    pr("p2", "c2", "Shop high-bay upgrade", "lighting",
      "Swap 16 400W metal-halide high bays for 150W LED UFO high bays (bays 1–4).\nAdd 6 LED wall packs outside. Lift is on site; bay 4 must be clear before 7am.",
      14250, 7600, { timeline_sent_at: ago(9), timeline_sent_via: "text", timeline_approved_at: ago(8) }),
    pr("p3", "c3", "RTU tune-up + thermostat", "hvac",
      "Tune-up of 2 rooftop units (filters, coils, belts, refrigerant check).\nInstall 2 smart thermostats with schedules. Roof access via rear ladder.", 3900, 1450,
      { timeline_sent_at: ago(7), timeline_sent_via: "email", timeline_approved_at: ago(6) }),
    pr("p4", "c4", "Plant floor lighting + HVAC controls", "lighting_hvac",
      "Phase A: 64 LED high bays on the production floor.\nPhase B: VFDs on 2 make-up air units + controls.\nSafety glasses and steel toes required on the floor.", 61800, 28900,
      { timeline_sent_at: ago(5), timeline_sent_via: "email", timeline_approved_at: ago(3) }),
    pr("p5", "c5", "Exterior + hallway LED retrofit", "lighting",
      "Buildings A–E: replace 120 hallway fixtures and 22 exterior wall packs with LED + photocells.", 22600, 11800),
    pr("p6", "c6", "HVAC tune-up + lighting assessment", "lighting_hvac",
      "Free ComEd lighting assessment + tune-up of 1 RTU. Quote LED retrofit for the studio floor.", 4800, 2100, { timeline_sent_at: ago(1), timeline_sent_via: "email" }),
  ];
  const ms = (project_id: string, rows: [string, number, boolean][]): Milestone[] =>
    rows.map(([name, off, done], i) => ({ id: randomUUID(), project_id, name, due_date: addDays(T, off), done, sort_order: i }));
  const milestones = [
    ...ms("p1", [["Site assessment", -21, true], ["Proposal approved", -10, true], ["Materials delivered", -4, true], ["Install – lobby & operatories", -2, true], ["Install – exam rooms & hallway", 0, false], ["Final walkthrough + rebate paperwork", 3, false]]),
    ...ms("p2", [["Site assessment", -14, true], ["Proposal approved", -8, true], ["Install high bays", 0, false], ["Wall packs + punch list", 1, false], ["Rebate submitted", 7, false]]),
    ...ms("p3", [["Proposal approved", -6, true], ["Tune-up + thermostats", -1, true], ["Manager sign-off", 1, false]]),
    ...ms("p4", [["Proposal approved", -3, true], ["Phase A install", 2, false], ["Phase A day 2", 3, false], ["Phase B VFDs", 14, false], ["Rebate submitted", 21, false]]),
    ...ms("p5", [["Site assessment", -2, true], ["Send proposal + timeline", 1, false], ["Install (2 days)", 10, false]]),
    ...ms("p6", [["Assessment visit", 4, false], ["Proposal", 7, false]]),
  ];
  const jb = (id: string, project_id: string, title: string, d: number, h1: number, h2: number, status: Job["status"], instructions: string | null, extra: Partial<Job> = {}): Job => ({
    id, project_id, title, starts_at: at(d, h1), ends_at: at(d, h2), status, instructions, started_at: null, completed_at: null, completed_by: null,
    approved_at: null, approved_by: null, review_note: null, kind: "install", service_request_id: null, ...extra,
  });
  const jobs = [
    jb("j1", "p1", "Lobby + operatories troffers", -2, 8, 12, "approved", "Front desk opens 8:30. Start in the lobby.", { started_at: at(-2, 8), completed_at: at(-2, 12), completed_by: "u-tech1", approved_at: at(-1, 9), approved_by: "u-manager" }),
    jb("j2", "p1", "Exam rooms + hallway retrofit", 0, 8, 15, "scheduled", "Operatories 3 & 4 after 1pm only. Bring 2 spare sensors."),
    jb("j3", "p2", "High bays – bays 1 & 2", 0, 7, 11, "in_progress", "Lift is in bay 2. Tony on site from 7am.", { started_at: at(0, 7, 5) }),
    jb("j8", "p2", "Bay 4 punch list", 0, 13, 15, "scheduled", "Quick punch list; customer asked for afternoon."),
    jb("j4", "p2", "High bays bays 3–4 + wall packs", 1, 7, 15, "scheduled", null),
    jb("j5", "p3", "RTU tune-up + thermostats", -1, 9, 13, "completed", "Roof ladder at rear; lockbox code from Maria.", { started_at: at(-1, 9), completed_at: at(-1, 12, 40), completed_by: "u-tech3" }),
    jb("j6", "p4", "Phase A – high bays (day 1)", 2, 7, 16, "scheduled", "Safety glasses + steel toes. Check in at the guard shack."),
    jb("j7", "p4", "Phase A – high bays (day 2)", 3, 7, 16, "scheduled", null),
  ];
  const as = (job_id: string, ...ids: string[]) => ids.map((profile_id) => ({ job_id, profile_id }));
  const assignments = [...as("j1", "u-tech1", "u-tech2"), ...as("j2", "u-tech1", "u-tech2"), ...as("j3", "u-tech4"), ...as("j8", "u-tech2"), ...as("j4", "u-tech4", "u-tech1"),
    ...as("j5", "u-tech3"), ...as("j6", "u-tech1", "u-tech2", "u-tech3"), ...as("j7", "u-tech1", "u-tech2")];
  const ph = (project_id: string, job_id: string | null, kind: Photo["kind"], caption: string, days: number, by: string, requirement_id: string | null = null): PhotoRow =>
    ({ id: randomUUID(), project_id, job_id, kind, storage_path: `seed/${kind}/${encodeURIComponent(caption)}.svg`, caption, requirement_id, uploaded_by: by, created_at: ago(days) });
  const req = (id: string, project_id: string, label: string, sort_order: number, note: string | null = null): PhotoRequirement =>
    ({ id, project_id, label, note, sort_order, created_at: ago(14) });
  const photo_requirements: PhotoRequirement[] = [
    req("r1", "p2", "T12 4ft", 0),
    req("r2", "p2", "400W MH", 1),
    req("r3", "p2", "Wall pack", 2),
    req("r4", "p1", "Lobby panel", 0),
    req("r5", "p1", "Operatory troffer", 1),
  ];
  const photos = [
    ph("p1", null, "before", "Lobby – T8 troffers", 20, "u-manager"), ph("p1", null, "before", "Operatory 3 ceiling", 20, "u-manager"), ph("p1", null, "before", "Hallway fixtures", 20, "u-manager"),
    ph("p2", null, "before", "Bay 2 metal halides", 14, "u-admin"), ph("p2", null, "before", "Exterior wall pack", 14, "u-admin"),
    ph("p3", null, "before", "RTU #1 filters", 7, "u-manager"), ph("p3", null, "before", "Old thermostat", 7, "u-manager"),
    ph("p4", null, "before", "Production floor", 5, "u-admin"), ph("p4", null, "before", "Make-up air unit", 5, "u-admin"),
    ph("p3", "j5", "completion", "RTU #1 new filters", 1, "u-tech3"), ph("p3", "j5", "completion", "Smart thermostat installed", 1, "u-tech3"),
    ph("p1", "j1", "completion", "Lobby LED panels", 2, "u-tech1", "r4"),
    ph("p2", "j3", "completion", "T12 bay 1 done", 0, "u-tech4", "r1"),
  ];
  const notes: NoteRow[] = [
    { id: randomUUID(), customer_id: null, project_id: null, job_id: "j5", body: "Replaced filters on both RTUs, cleaned condenser coils, new belt on RTU #2. Refrigerant OK. Thermostats installed and scheduled (6a–7p M–Sa).", author_id: "u-tech3", created_at: at(-1, 12, 35) },
    { id: randomUUID(), customer_id: null, project_id: null, job_id: "j1", body: "Lobby and operatories 1–2 done (18 panels). Old ballasts boxed for recycling.", author_id: "u-tech1", created_at: at(-2, 11, 50) },
    { id: randomUUID(), customer_id: null, project_id: null, job_id: "j3", body: "Started bay 1. Two fixtures need longer chain; using spares from the van.", author_id: "u-tech4", created_at: at(0, 8, 10) },
  ];
  const msg = (customer_id: string, project_id: string | null, channel: Message["channel"], direction: Message["direction"], subject: string | null, body: string, days: number, by: string): MessageRow =>
    ({ id: randomUUID(), customer_id, project_id, channel, direction, subject, body, sent_by: by, created_at: ago(days) });
  const messages = [
    msg("c1", "p1", "timeline", "outbound", "Proposed timeline: LED retrofit – full office", "Sent via email", 12, "u-manager"),
    msg("c1", "p1", "call", "inbound", null, "Dr. Nair approved the timeline by phone. Wants exam rooms done on a Friday afternoon.", 10, "u-manager"),
    msg("c2", "p2", "timeline", "outbound", "Proposed timeline: Shop high-bay upgrade", "Sent via text", 9, "u-admin"),
    msg("c3", "p3", "email", "outbound", "Tune-up visit confirmed", "Andre will be on site at 9am. Roof ladder at the rear.", 3, "u-manager"),
    msg("c6", "p6", "timeline", "outbound", "Proposed timeline: HVAC tune-up + lighting assessment", "Sent via email", 1, "u-manager"),
    msg("c7", null, "call", "inbound", null, "Rosa called after a referral from Golf Road Auto Body. Interested in a lighting assessment.", 3, "u-admin"),
  ];
  const db = { projects, milestones, jobs, assignments, photos, notes, messages, photo_requirements };
  for (const p of projects) syncProject(db, p.id);
  return db;
}

/** Mirrors the sync_project_status() trigger. */
function syncProject(db: Pick<P2, "projects" | "jobs">, projectId: string) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p || p.status === "cancelled") return;
  // only install visits drive the project; warranty/service visits never reopen it
  const st = db.jobs.filter((j) => j.project_id === projectId && j.status !== "cancelled" && (j.kind ?? "install") === "install").map((j) => j.status);
  const next: ProjectStatus | null = st.includes("completed") ? "awaiting_review" : st.includes("in_progress") ? "in_progress" : st.includes("scheduled") ? "scheduled" : st.includes("approved") ? "complete" : null;
  if (next && next !== p.status) { p.status = next; p.updated_at = now(); }
}

/** Mirrors the sync_service_request() trigger: a ticket follows its visit. */
function syncServiceRequest(db: DB, j: Job, prev: Job["status"] | null, uid: string | null) {
  if (!j.service_request_id || prev === j.status) return;
  const sr = db.service_requests.find((x) => x.id === j.service_request_id);
  if (!sr) return;
  const ev = (kind: SREventRow["kind"], body: string) => db.sr_events.push({ id: randomUUID(), request_id: sr.id, kind, body, actor_id: uid || null, created_at: now() });
  if ((j.status === "completed" || j.status === "approved") && SR_OPEN.includes(sr.status)) {
    Object.assign(sr, { status: "resolved", resolved_at: now(), resolved_by: uid || null, resolved_job_id: j.id, updated_at: now() });
    ev("resolved", `Resolved automatically: visit “${j.title}” was ${j.status === "approved" ? "approved" : "completed"}.`);
  } else if ((j.status === "scheduled" || j.status === "in_progress") && sr.status === "resolved" && sr.resolved_job_id === j.id) {
    Object.assign(sr, { status: "scheduled", resolved_at: null, resolved_by: null, resolved_job_id: null, updated_at: now() });
    ev("reopened", `Visit “${j.title}” was sent back or reopened, so the ticket is Scheduled again.`);
  } else if (j.status === "cancelled" && sr.status === "scheduled" && !db.jobs.some((x) => x.service_request_id === sr.id && x.id !== j.id && x.status !== "cancelled")) {
    Object.assign(sr, { status: "triaged", updated_at: now() });
    ev("status", `Visit “${j.title}” was cancelled, so the ticket is back to Triaged.`);
  }
}

/** All service/warranty visits for the given tickets (one pass over jobs, no N+1). */
function ticketVisitsFor(db: DB, requestIds: string[]) {
  const want = new Set(requestIds);
  return db.jobs.filter((j) => j.service_request_id && want.has(j.service_request_id)).map((j) => {
    const techs = viewJob(db, j).assignees;
    return { request_id: j.service_request_id!, job_id: j.id, starts_at: j.starts_at, status: j.status, kind: j.kind, techs };
  });
}

/** Mirrors public.service_request_list. */
function viewSR(db: DB, sr: ServiceRequest): ServiceRequestView {
  const p = sr.project_id ? db.projects.find((x) => x.id === sr.project_id) ?? null : null;
  const completed = p ? projectDates(db.jobs.filter((j) => j.project_id === p.id)).completed_date : null;
  const w = warrantyFor(completed, p?.warranty_months ?? null, sr.received_at);
  const a = sr.assignee_id ? db.profiles.find((x) => x.id === sr.assignee_id) : null;
  return {
    ...sr, customer_name: db.customers.find((c) => c.id === sr.customer_id)?.name ?? "",
    project_name: p?.name ?? null, project_type: p?.type ?? null, project_status: p?.status ?? null, warranty_months: p?.warranty_months ?? null,
    project_completed_at: completed, warranty_expires_at: w.expires, warranty_state: w.state, assignee_name: a?.full_name ?? null, assignee_color: a?.color ?? null,
  };
}
function srMatches(v: ServiceRequestView, f: SRPageFilter, status: SRPageFilter["status"]) {
  const raw = (f.q ?? "").trim().toLowerCase();
  const num = /^(?:sr-?)?(\d{1,9})$/i.exec(raw)?.[1];
  if (raw && !(num && String(v.number) === num) && ![v.summary, v.description, v.customer_name, v.contact_name, v.site_address, v.site_city, v.project_name].join(" ").toLowerCase().includes(raw)) return false;
  if (f.channel && v.channel !== f.channel) return false;
  if (f.warranty && v.warranty_state !== f.warranty) return false;
  if (f.assignee === "none" ? v.assignee_id : f.assignee && v.assignee_id !== f.assignee) return false;
  if (status === "open" || !status) return SR_OPEN.includes(v.status);
  return status === "all" || v.status === status;
}

/** Sample tickets: two finished projects from past years + a warranty visit on the calendar. */
function seedServiceRequests(db: DB) {
  const T = todayKey();
  const at = (dayOffset: number, h: number, m = 0) => zonedToUtc(addDays(T, dayOffset), h * 60 + m);
  const pr = (id: string, customer_id: string, name: string, type: Project["type"], scope: string, value: number, est_rebate: number, days: number): Project => ({
    id, customer_id, name, type, status: "complete", scope, value, est_rebate, timeline_sent_at: null, timeline_sent_via: null, timeline_approved_at: ago(days + 20),
    warranty_months: DEFAULT_WARRANTY_MONTHS, created_at: ago(days + 30), updated_at: ago(days),
  });
  const done = (id: string, project_id: string, title: string, d: number, by: string, extra: Partial<Job> = {}): Job => ({
    id, project_id, title, starts_at: at(d, 7), ends_at: at(d, 15), status: "approved", instructions: null, started_at: at(d, 7), completed_at: at(d, 14, 30), completed_by: by,
    approved_at: at(d + 1, 9), approved_by: "u-manager", review_note: null, kind: "install", service_request_id: null, ...extra,
  });
  if (!db.projects.some((p) => p.id === "p7")) {
    db.projects.push(
      pr("p7", "c4", "Office & breakroom LED troffer retrofit", "lighting", "Replace 38 (2x4) troffers in the front office and breakroom with 40W LED panels. 2 emergency fixtures with battery backup at the exits.", 12800, 6100, 250),
      pr("p8", "c2", "Paint booth RTU replacement", "hvac", "Replace the 15-ton paint booth RTU with a high-efficiency unit and new curb adapter.", 24500, 4800, 800),
    );
    db.jobs.push(done("j9", "p7", "Office troffers (day 1)", -251, "u-tech1"), done("j10", "p7", "Breakroom + exits (day 2)", -250, "u-tech2"), done("j11", "p8", "RTU swap + startup", -800, "u-tech3"));
    db.assignments.push({ job_id: "j9", profile_id: "u-tech1" }, { job_id: "j9", profile_id: "u-tech2" }, { job_id: "j10", profile_id: "u-tech2" }, { job_id: "j11", profile_id: "u-tech3" });
  }
  const sr = (id: string, number: number, customer_id: string, project_id: string | null, channel: ServiceRequest["channel"], received_at: string, summary: string, description: string, extra: Partial<ServiceRequest> = {}): ServiceRequest => {
    const c = db.customers.find((x) => x.id === customer_id);
    const k = db.contacts.find((x) => x.customer_id === customer_id && x.is_primary);
    return {
      id, number, customer_id, project_id, site_address: c?.address ?? null, site_city: c?.city ?? null, site_state: c?.state ?? null, site_zip: c?.zip ?? null,
      contact_name: k?.name ?? null, contact_phone: k?.phone ?? null, contact_email: k?.email ?? null, channel, received_at, summary, description, priority: "normal", status: "new",
      billable: false, assignee_id: null, converted_project_id: null, resolved_at: null, resolved_by: null, resolved_job_id: null, created_by: "u-manager",
      created_at: received_at, updated_at: received_at, ...(c ? { lat: c.lat, lng: c.lng, geocoded_at: c.geocoded_at, geocode_status: c.geocode_status } : emptyGeocode()), ...extra,
    };
  };
  const tickets = [
    sr("sr1", 1001, "c4", "p7", "email", at(0, 9, 14), "Conference room troffer flickering", "Dave emailed: one of the LED panels in the front conference room started flickering last week and now cuts out every few minutes. Installed in the office retrofit earlier this year.", { priority: "high", contact_name: "Dave Kowalski" }),
    sr("sr2", 1002, "c2", "p8", "call", at(-1, 16, 22), "Paint booth RTU short-cycling", "Tony called: the paint booth unit turns on and off every few minutes since the cold snap. Booth is still usable but temps swing.", { status: "triaged", assignee_id: "u-manager" }),
    sr("sr3", 1003, "c8", null, "call", at(0, 8, 2), "Parking lot pole light out", "Ken says the pole light by the drive-thru lane is out. Not sure if we installed it. Match a past job or convert if it's new work.", { priority: "low" }),
    sr("sr4", 1004, "c4", "p7", "call", at(-2, 11, 6), "Exit fixtures not holding battery", "Fire inspection flagged the two emergency fixtures by the rear exits: battery test fails after about 30 seconds.", { status: "scheduled", assignee_id: "u-admin" }),
    sr("sr5", 1005, "c3", "p3", "email", at(-4, 13, 40), "Thermostat schedule reset after outage", "Megan says the new thermostats lost their schedule after a power outage.", { status: "resolved", resolved_at: at(-3, 10), resolved_by: "u-manager" }),
    sr("sr6", 1006, "c5", null, "other", at(-6, 10), "Asked about adding motion sensors", "Linda asked at the gate whether we could add motion sensors to building F. Not a repair; sent to sales.", { status: "closed", resolved_at: at(-5, 9), resolved_by: "u-admin" }),
  ];
  for (const t of tickets) if (!db.service_requests.some((x) => x.id === t.id)) db.service_requests.push(t);
  if (!db.jobs.some((j) => j.id === "j12")) {
    db.jobs.push({ id: "j12", project_id: "p7", title: "Warranty — exit fixture batteries", starts_at: at(1, 9), ends_at: at(1, 11), status: "scheduled",
      instructions: "Swap the battery packs in the 2 emergency fixtures at the rear exits (same model as the original install). Photo each fixture after a 90-minute test.",
      started_at: null, completed_at: null, completed_by: null, approved_at: null, approved_by: null, review_note: null, kind: "warranty", service_request_id: "sr4" });
    db.assignments.push({ job_id: "j12", profile_id: "u-tech1" });
  }
  const ev = (request_id: string, kind: SREventRow["kind"], body: string, actor_id: string | null, created_at: string) => ({ id: randomUUID(), request_id, kind, body, actor_id, created_at });
  if (!db.sr_events.length) db.sr_events.push(
    ev("sr1", "created", "Logged from an email.", "u-manager", at(0, 9, 14)),
    ev("sr1", "linked", "Matched to original project “Office & breakroom LED troffer retrofit”.", "u-manager", at(0, 9, 15)),
    ev("sr1", "note", "Panel is inside the 1-year lighting warranty, so this is a warranty swap, not a new project.", "u-admin", at(0, 9, 21)),
    ev("sr2", "created", "Logged from a phone call.", "u-manager", at(-1, 16, 22)),
    ev("sr2", "assigned", "Assigned to Maria Santos.", "u-manager", at(-1, 16, 25)),
    ev("sr2", "note", "Unit is past its 1-year warranty. Quote a service call if it's not a quick fix.", "u-manager", at(-1, 16, 30)),
    ev("sr3", "created", "Logged from a phone call.", "u-admin", at(0, 8, 2)),
    ev("sr4", "created", "Logged from a phone call.", "u-admin", at(-2, 11, 6)),
    ev("sr4", "scheduled", `Warranty visit “Warranty — exit fixture batteries” scheduled for ${fmtShort(at(1, 9))} with Carlos Mendez.`, "u-admin", at(-2, 11, 20)),
    ev("sr5", "created", "Logged from an email.", "u-manager", at(-4, 13, 40)),
    ev("sr5", "resolved", "Resolved: walked Megan through restoring the schedule by phone.", "u-manager", at(-3, 10)),
    ev("sr6", "created", "Logged from another channel.", "u-admin", at(-6, 10)),
    ev("sr6", "closed", "Closed: new work, passed to sales.", "u-admin", at(-5, 9)),
  );
}
const fmtShort = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: process.env.NEXT_PUBLIC_TZ || "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function load(): DB {
  if (!existsSync(FILE)) { const db = seed(); save(db); return db; }
  const db = JSON.parse(readFileSync(FILE, "utf8")) as DB;
  if (!db.projects) { Object.assign(db, seedPhase2()); save(db); } // upgrade a phase-1 mock DB
  if (!db.photo_requirements) { db.photo_requirements = []; save(db); }
  for (const p of db.photos) if (p.requirement_id === undefined) (p as PhotoRow).requirement_id = null;
  for (const j of db.jobs) { j.kind ??= "install"; if (j.service_request_id === undefined) j.service_request_id = null; }
  for (const p of db.projects) p.warranty_months ??= DEFAULT_WARRANTY_MONTHS;
  if (!db.service_requests) { db.service_requests = []; db.sr_events = []; seedServiceRequests(db); save(db); } // upgrade an older mock DB
  let fleetTouched = false;
  if (!db.fleet_vehicles) { db.fleet_vehicles = SAMPLE_DEFAULT_MAP.map((m) => ({ ...m })); fleetTouched = true; }
  for (const prof of db.profiles) {
    if (prof.fleet_access === undefined) {
      prof.fleet_access = prof.id === "u-manager";
      fleetTouched = true;
    }
  }
  if (fleetTouched) save(db);
  let geoTouched = false;
  const blankGeo = () => { geoTouched = true; return emptyGeocode(); };
  for (const row of db.customers) {
    if (row.geocode_status === undefined) Object.assign(row, blankGeo());
  }
  for (const row of db.service_requests ?? []) {
    if (row.geocode_status === undefined) Object.assign(row, blankGeo());
  }
  if (geoTouched) save(db);
  return db;
}
function save(db: DB) { writeFileSync(FILE, JSON.stringify(db, null, 2)); }
function mutate<T>(fn: (db: DB) => T): T { const db = load(); const r = fn(db); save(db); return r; }

export function mockProfiles() { return load().profiles; }

/** Mock stand-in for auth.uid() + RLS helpers. */
async function who() {
  const uid = (await cookies()).get("rr_mock_uid")?.value ?? "";
  const db = load();
  const me = db.profiles.find((p) => p.id === uid);
  const role = me?.active ? me.role : null;
  const staff = role === "admin" || role === "manager";
  const fleetAccess = hasFleetAccess({ role, fleet_access: me?.fleet_access });
  const myJobs = new Set(db.assignments.filter((a) => a.profile_id === uid).map((a) => a.job_id));
  const myProjects = new Set(db.jobs.filter((j) => myJobs.has(j.id)).map((j) => j.project_id));
  return { uid, role, staff, fleetAccess, canJob: (id: string) => staff || myJobs.has(id), canProject: (id: string) => staff || myProjects.has(id) };
}
function requireStaffMock(w: { staff: boolean }) { if (!w.staff) throw new Error("permission denied (mock RLS)"); }

function viewJob(db: DB, j: Job): JobView {
  const p = db.projects.find((x) => x.id === j.project_id)!;
  const c = db.customers.find((x) => x.id === p.customer_id);
  const addr = c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : null;
  const assignees = db.assignments.filter((a) => a.job_id === j.id).map((a) => db.profiles.find((x) => x.id === a.profile_id)).filter(Boolean)
    .map((x) => ({
      id: x!.id, full_name: x!.full_name, color: x!.color,
      avatar_url: resolveAvatarUrl(x!, x!.avatar_source === "upload" && x!.avatar_path ? `/api/mock-photo/${x!.avatar_path}` : null),
    }));
  const sr = j.service_request_id ? db.service_requests.find((x) => x.id === j.service_request_id) : null;
  const { latitude, longitude } = visitCoords(c, sr);
  return { ...j, project_name: p.name, project_type: p.type, customer_id: p.customer_id, customer_name: c?.name ?? "", address: addr || null, assignees, latitude, longitude };
}
const profileOf = (db: DB, id: string | null) => (id ? db.profiles.find((p) => p.id === id) ?? null : null);
const labelOf = (db: DB, id: string | null) => authorLabel(id, profileOf(db, id));
const colorOf = (db: DB, id: string | null) => authorColor(profileOf(db, id));

export const mockRepo: Repo = {
  async listCustomers(q) {
    const db = load();
    const search = parseSearch(q); // same rules as the customer_search table: src/lib/search.ts
    return db.customers
      .filter((c) => {
        if (!search) return true;
        const { doc, digits } = customerSearchFields(c, db.contacts.filter((x) => x.customer_id === c.id));
        return matchesSearch(doc, digits, search);
      })
      .map((c) => {
        const cs = db.contacts.filter((x) => x.customer_id === c.id);
        return { ...c, primary_contact: cs.find((x) => x.is_primary)?.name ?? cs[0]?.name ?? null, project_count: db.projects.filter((p) => p.customer_id === c.id).length };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async pageCustomers(f) {
    const all = await mockRepo.listCustomers(f.q);
    if (f.sort === "name_desc") all.reverse();
    else if (f.sort === "newest") all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const r = mockPage(all, f.page, f.size);
    return { ...r, items: r.items.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, state: c.state, zip: c.zip, tags: c.tags, primary_contact: c.primary_contact })) };
  },
  async getCustomer(id) { return load().customers.find((c) => c.id === id) ?? null; },
  async createCustomer(input) {
    return mutate((db) => { const c: Customer = { ...input, id: randomUUID(), created_at: now(), updated_at: now(), ...emptyGeocode() }; db.customers.push(c); return c; });
  },
  async updateCustomer(id, input) {
    mutate((db) => {
      const c = db.customers.find((x) => x.id === id); if (!c) throw new Error("Customer not found");
      const changed = addressChanged(c, input);
      Object.assign(c, input, { updated_at: now() });
      if (changed) Object.assign(c, emptyGeocode());
    });
  },
  async listContacts(customerId) {
    return load().contacts.filter((c) => c.customer_id === customerId).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));
  },
  async addContact(customerId, input) {
    mutate((db) => {
      if (input.is_primary) db.contacts.forEach((c) => { if (c.customer_id === customerId) c.is_primary = false; });
      db.contacts.push({ ...input, id: randomUUID(), customer_id: customerId });
    });
  },
  async deleteContact(id) { mutate((db) => { db.contacts = db.contacts.filter((c) => c.id !== id); }); },

  async listTeam() {
    const db = load();
    const merged = mergeTeam(db.profiles.filter((p) => !p.deleted_at), db.invites);
    return merged.map((m) => ({
      ...m,
      avatar_url: resolveAvatarUrl(m, m.avatar_source === "upload" && m.avatar_path ? `/api/mock-photo/${m.avatar_path}` : null),
    }));
  },
  async getProfile(id) { const row = load().profiles.find((p) => p.id === id); return row ? { ...row, fleet_access: !!row.fleet_access } : null; },
  async upsertInvite(input) {
    mutate((db) => {
      const email = input.email.toLowerCase();
      const existing = db.invites.find((i) => i.email === email);
      if (existing) Object.assign(existing, input, { email, avatar_source: input.avatar_source ?? existing.avatar_source, avatar_path: input.avatar_path !== undefined ? input.avatar_path : existing.avatar_path });
      else db.invites.push({ ...input, email, avatar_source: input.avatar_source ?? "none", avatar_path: input.avatar_path ?? null, invited_at: now(), accepted_at: null });
      const prof = db.profiles.find((p) => p.email === email); // mirrors the sync_invite_to_profile trigger
      if (prof) {
        Object.assign(prof, {
          role: input.role, full_name: input.full_name || prof.full_name, title: input.title, phone: input.phone, color: input.color,
          ...(input.avatar_source !== undefined ? { avatar_source: input.avatar_source } : {}),
          ...(input.avatar_path !== undefined ? { avatar_path: input.avatar_path } : {}),
        });
        const inv = db.invites.find((i) => i.email === email)!; inv.accepted_at ??= now();
      }
    });
  },
  async removeFromTeam(email) {
    mutate((db) => {
      db.invites = db.invites.filter((i) => i.email !== email);
      const prof = db.profiles.find((p) => p.email === email); if (prof) prof.role = null;
    });
  },
  async setActive(profileId, active) { mutate((db) => { const p = db.profiles.find((x) => x.id === profileId); if (p && !p.deleted_at) p.active = active; }); },
  async uploadAvatar(target, file) {
    const folder = target.profile_id ?? `pending/${target.email.toLowerCase()}`;
    const path = `${folder}/${randomUUID()}.jpg`;
    const full = join(MOCK_UPLOADS, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(await file.arrayBuffer()));
    mutate((db) => {
      const email = target.email.toLowerCase();
      if (target.profile_id) {
        const p = db.profiles.find((x) => x.id === target.profile_id);
        if (p) { p.avatar_source = "upload"; p.avatar_path = path; }
      }
      const inv = db.invites.find((i) => i.email === email);
      if (inv) { inv.avatar_source = "upload"; inv.avatar_path = path; }
    });
  },
  async setAvatarSource(target, source) {
    mutate((db) => {
      const email = target.email.toLowerCase();
      if (target.profile_id) {
        const p = db.profiles.find((x) => x.id === target.profile_id);
        if (p) { p.avatar_source = source; if (source === "none") p.avatar_path = null; }
      }
      const inv = db.invites.find((i) => i.email === email);
      if (inv) { inv.avatar_source = source; if (source === "none") inv.avatar_path = null; }
    });
  },
  async removeAvatar(target) {
    await this.setAvatarSource(target, "none");
  },
  async syncOwnGoogleAvatar(googleUrl) {
    const w = await who();
    mutate((db) => {
      const p = db.profiles.find((x) => x.id === w.uid);
      if (!p) return;
      p.google_avatar_url = googleUrl;
      if (googleUrl && p.avatar_source === "none") p.avatar_source = "google";
    });
  },
  async updateOwnAvatar(patch) {
    const w = await who();
    const db = load();
    const me = db.profiles.find((p) => p.id === w.uid);
    if (!me) throw new Error("Not signed in");
    if (patch.clear) return this.removeAvatar({ email: me.email, profile_id: me.id });
    if (patch.file) return this.uploadAvatar({ email: me.email, profile_id: me.id }, patch.file);
    if (patch.avatar_source) return this.setAvatarSource({ email: me.email, profile_id: me.id }, patch.avatar_source);
  },
  async softDeleteMember(profileId, actorId) {
    return mutate((db) => {
      const p = db.profiles.find((x) => x.id === profileId && !x.deleted_at);
      if (!p) throw new Error("Member not found.");
      const email = p.email; const full_name = p.full_name;
      db.invites = db.invites.filter((i) => i.email !== email);
      Object.assign(p, {
        email: `deleted-${profileId.slice(0, 8)}@deleted.invalid`, full_name: "Removed user", phone: null, title: null,
        role: null, active: false, avatar_source: "none" as const, avatar_path: null, google_avatar_url: null,
        deleted_at: now(),
      });
      db.admin_audit.push({ id: randomUUID(), actor_id: actorId, action: "soft_delete", target_email: email, target_profile_id: profileId, detail: {}, created_at: now() });
      return { email, full_name };
    });
  },
  async writeAdminAudit(row) {
    mutate((db) => {
      db.admin_audit.push({
        id: randomUUID(), actor_id: row.actor_id, action: row.action,
        target_email: row.target_email ?? null, target_profile_id: row.target_profile_id ?? null,
        detail: row.detail ?? {}, created_at: now(),
      });
    });
  },
  async countActiveAdmins() {
    return load().profiles.filter((p) => p.role === "admin" && p.active && !p.deleted_at).length;
  },
  async counts() {
    const db = load();
    const T = todayKey();
    return {
      customers: db.customers.length, team: db.profiles.filter((p) => p.role && p.active).length, invited: db.invites.filter((i) => !i.accepted_at).length,
      activeProjects: db.projects.filter((p) => ["scheduled", "in_progress", "awaiting_review"].includes(p.status)).length,
      proposed: db.projects.filter((p) => p.status === "proposed").length,
      jobsToday: db.jobs.filter((j) => j.status !== "cancelled" && dayKey(j.starts_at) === T).length,
      awaitingReview: db.jobs.filter((j) => j.status === "completed").length,
    };
  },

  // ---------------------------------------------------------------- phase 2
  async listProjects(f = {}) {
    const w = await who(); const db = load();
    const search = parseSearch(f.q); // same rules as the project_search table: src/lib/search.ts
    const custFields = new Map<string, { doc: string; digits: string }>();
    const fieldsOf = (cid: string) => {
      if (!custFields.has(cid)) {
        const c = db.customers.find((x) => x.id === cid);
        custFields.set(cid, c ? customerSearchFields(c, db.contacts.filter((x) => x.customer_id === cid)) : { doc: "", digits: "" });
      }
      return custFields.get(cid)!;
    };
    const nowIso = now();
    return db.projects
      .filter((p) => w.canProject(p.id) && (!f.status || p.status === f.status) && (!f.customerId || p.customer_id === f.customerId))
      .filter((p) => { if (!search) return true; const s = projectSearchFields(p, fieldsOf(p.customer_id)); return matchesSearch(s.doc, s.digits, search); })
      .map((p) => {
        const jobs = db.jobs.filter((j) => j.project_id === p.id && j.status !== "cancelled");
        const team = new Map<string, { id: string; full_name: string; color: string; avatar_url?: string | null }>();
        for (const j of jobs) for (const a of viewJob(db, j).assignees) team.set(a.id, a);
        const ms = db.milestones.filter((m) => m.project_id === p.id);
        return {
          ...p, customer_name: db.customers.find((c) => c.id === p.customer_id)?.name ?? "",
          next_visit: jobs.filter((j) => j.ends_at > nowIso && (j.status === "scheduled" || j.status === "in_progress")).map((j) => j.starts_at).sort()[0] ?? null,
          team: [...team.values()], done_milestones: ms.filter((m) => m.done).length, total_milestones: ms.length,
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async pageProjects(f) {
    const all = await mockRepo.listProjects({ q: f.q });
    const counts: Record<string, number> = { active: all.filter((p) => p.status !== "cancelled").length };
    for (const st of PROJECT_STATUSES) counts[st] = all.filter((p) => p.status === st).length;
    const list = all.filter((p) => (f.status ? p.status === f.status : p.status !== "cancelled"));
    if (f.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (f.sort === "value") list.sort((a, b) => b.value - a.value);
    else if (f.sort === "newest") list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const pg = mockPage(list, f.page, f.size), db = load();
    const items = pg.items.map((p) => ({ ...p, address: formatAddress(db.customers.find((c) => c.id === p.customer_id)), ...projectDates(db.jobs.filter((j) => j.project_id === p.id)) }));
    return { ...pg, items, counts };
  },
  async getProject(id) { const w = await who(); return w.canProject(id) ? load().projects.find((p) => p.id === id) ?? null : null; },
  async createProject(input) {
    requireStaffMock(await who());
    return mutate((db) => {
      const p: Project = { ...input, warranty_months: input.warranty_months ?? DEFAULT_WARRANTY_MONTHS, id: randomUUID(), timeline_sent_at: null, timeline_sent_via: null, timeline_approved_at: null, created_at: now(), updated_at: now() };
      db.projects.push(p); return p;
    });
  },
  async updateProject(id, patch) {
    requireStaffMock(await who());
    mutate((db) => { const p = db.projects.find((x) => x.id === id); if (!p) throw new Error("Project not found"); Object.assign(p, patch, { updated_at: now() }); });
  },
  async listMilestones(projectId) {
    const w = await who();
    if (!w.canProject(projectId)) return [];
    return load().milestones.filter((m) => m.project_id === projectId).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9") || a.sort_order - b.sort_order);
  },
  async addMilestone(projectId, m) {
    requireStaffMock(await who());
    mutate((db) => { db.milestones.push({ id: randomUUID(), project_id: projectId, name: m.name, due_date: m.due_date, done: false, sort_order: db.milestones.filter((x) => x.project_id === projectId).length }); });
  },
  async updateMilestone(id, patch) { requireStaffMock(await who()); mutate((db) => { const m = db.milestones.find((x) => x.id === id); if (m) Object.assign(m, patch); }); },
  async deleteMilestone(id) { requireStaffMock(await who()); mutate((db) => { db.milestones = db.milestones.filter((x) => x.id !== id); }); },
  async listAssignable() {
    const order = { tech: 0, manager: 1, admin: 2 } as Record<string, number>;
    return load().profiles.filter((p) => p.role && p.active && !p.deleted_at).sort((a, b) => order[a.role!] - order[b.role!] || a.full_name.localeCompare(b.full_name))
      .map((p) => ({
        id: p.id, full_name: p.full_name, color: p.color, role: p.role!,
        avatar_url: resolveAvatarUrl(p, p.avatar_source === "upload" && p.avatar_path ? `/api/mock-photo/${p.avatar_path}` : null),
      }));
  },
  async listJobs(f = {}) {
    const w = await who(); const db = load();
    return db.jobs
      .filter((j) => w.canJob(j.id) && (!f.projectId || j.project_id === f.projectId) && (!f.serviceRequestId || j.service_request_id === f.serviceRequestId) && (!f.status || f.status.includes(j.status))
        && (!f.from || j.ends_at > f.from) && (!f.to || j.starts_at < f.to))
      .map((j) => viewJob(db, j))
      .filter((j) => !f.assignee || j.assignees.some((a) => a.id === f.assignee))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  },
  async getJob(id) { const w = await who(); const db = load(); const j = db.jobs.find((x) => x.id === id); return j && w.canJob(id) ? viewJob(db, j) : null; },
  async createJob(input, assignees) {
    requireStaffMock(await who());
    return mutate((db) => {
      const id = randomUUID();
      if (input.service_request_id && (input.kind ?? "install") === "install") throw new Error('new row for relation "jobs" violates check constraint "jobs_ticket_visit_kind"');
      db.jobs.push({ ...input, kind: input.kind ?? "install", service_request_id: input.service_request_id ?? null, id, status: "scheduled", started_at: null, completed_at: null, completed_by: null, approved_at: null, approved_by: null, review_note: null });
      for (const pid of new Set(assignees)) db.assignments.push({ job_id: id, profile_id: pid });
      syncProject(db, input.project_id);
      return id;
    });
  },
  async updateJob(id, patch) {
    const w = await who();
    mutate((db) => {
      const j = db.jobs.find((x) => x.id === id);
      if (!j || !w.canJob(id)) throw new Error("Job not found");
      if (!w.staff) { // mirrors guard_job_update()
        const keys = Object.keys(patch).filter((k) => k !== "status");
        if (keys.length) throw new Error("techs can only update job progress");
        const ok = (j.status === "scheduled" && patch.status === "in_progress") || (j.status === "in_progress" && patch.status === "completed");
        if (patch.status && patch.status !== j.status && !ok) throw new Error(`invalid status change for tech: ${j.status} -> ${patch.status}`);
        if (patch.status === "completed") {
          if (!db.notes.some((n) => n.job_id === id))
            throw new Error("add at least one completion photo and a note before submitting");
          const reqs = (j.kind ?? "install") !== "install" ? [] : db.photo_requirements.filter((r) => r.project_id === j.project_id).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
          if (reqs.length) {
            const missing = reqs.filter((r) => !db.photos.some((p) => p.job_id === id && p.kind === "completion" && p.requirement_id === r.id)).map((r) => r.label);
            if (missing.length) throw new Error(`missing required photos: ${missing.join(", ")}`);
          } else if (!db.photos.some((p) => p.job_id === id && p.kind === "completion")) {
            throw new Error("add at least one completion photo and a note before submitting");
          }
          Object.assign(patch, { completed_at: now(), completed_by: w.uid });
        }
        if (patch.status === "in_progress") Object.assign(patch, { started_at: now() });
      }
      const prev = j.status;
      Object.assign(j, patch);
      syncProject(db, j.project_id);
      syncServiceRequest(db, j, prev, w.uid);
    });
  },
  async setAssignees(jobId, ids) {
    requireStaffMock(await who());
    mutate((db) => { db.assignments = db.assignments.filter((a) => a.job_id !== jobId); for (const pid of new Set(ids)) db.assignments.push({ job_id: jobId, profile_id: pid }); });
  },
  async listPhotos(f) {
    const w = await who(); const db = load();
    return db.photos
      .filter((p) => (!f.projectId || p.project_id === f.projectId) && (!f.jobId || p.job_id === f.jobId) && (!f.kind || p.kind === f.kind))
      .filter((p) => w.staff || (p.kind === "before" && w.canProject(p.project_id)) || (p.job_id && w.canJob(p.job_id)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => ({
        ...p,
        url: `/api/mock-photo/${p.storage_path}`,
        uploader_name: labelOf(db, p.uploaded_by),
        uploader_color: colorOf(db, p.uploaded_by),
      }));
  },
  async addPhoto(meta, file) {
    const w = await who();
    if (!w.staff && !(meta.kind === "completion" && meta.job_id && w.canJob(meta.job_id))) throw new Error("permission denied (mock RLS)");
    if (meta.requirement_id) {
      if (meta.kind !== "completion" || !meta.job_id) throw new Error("required photo items only apply to completion photos");
      const db0 = load();
      const req = db0.photo_requirements.find((r) => r.id === meta.requirement_id);
      if (!req) throw new Error("unknown required photo item");
      if (req.project_id !== meta.project_id) throw new Error("required photo item belongs to a different project");
    }
    const path = `${meta.project_id}/${meta.kind}/${randomUUID()}.jpg`;
    const full = join(MOCK_UPLOADS, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(await file.arrayBuffer()));
    mutate((db) => {
      db.photos.push({
        id: randomUUID(), project_id: meta.project_id, job_id: meta.job_id, kind: meta.kind, caption: meta.caption,
        requirement_id: meta.requirement_id ?? null, storage_path: path, uploaded_by: w.uid, created_at: now(),
      });
    });
  },
  async deletePhoto(id) {
    const w = await who();
    mutate((db) => {
      const p = db.photos.find((x) => x.id === id);
      if (!p) return;
      if (!w.staff) {
        if (p.kind !== "completion" || p.uploaded_by !== w.uid) throw new Error("permission denied (mock RLS)");
        const job = p.job_id ? db.jobs.find((j) => j.id === p.job_id) : null;
        if (!job || job.status !== "in_progress") throw new Error("permission denied (mock RLS)");
      }
      db.photos = db.photos.filter((x) => x.id !== id);
    });
  },
  async listPhotoRequirements(projectId) {
    const w = await who(); const db = load();
    if (!w.staff && !w.canProject(projectId)) return [];
    return db.photo_requirements.filter((r) => r.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  },
  async addPhotoRequirement(projectId, input) {
    requireStaffMock(await who());
    mutate((db) => {
      const max = db.photo_requirements.filter((r) => r.project_id === projectId).reduce((m, r) => Math.max(m, r.sort_order), -1);
      db.photo_requirements.push({ id: randomUUID(), project_id: projectId, label: input.label.trim(), note: input.note, sort_order: max + 1, created_at: now() });
    });
  },
  async updatePhotoRequirement(id, patch) {
    requireStaffMock(await who());
    mutate((db) => { const r = db.photo_requirements.find((x) => x.id === id); if (r) Object.assign(r, patch); });
  },
  async deletePhotoRequirement(id) {
    requireStaffMock(await who());
    mutate((db) => {
      db.photo_requirements = db.photo_requirements.filter((r) => r.id !== id);
      for (const p of db.photos) if (p.requirement_id === id) p.requirement_id = null;
    });
  },
  async reorderPhotoRequirements(projectId, orderedIds) {
    requireStaffMock(await who());
    mutate((db) => {
      orderedIds.forEach((id, i) => {
        const r = db.photo_requirements.find((x) => x.id === id && x.project_id === projectId);
        if (r) r.sort_order = i;
      });
    });
  },
  async listNotes(f) {
    const w = await who(); const db = load();
    const jobIds = f.projectId ? new Set(db.jobs.filter((j) => j.project_id === f.projectId).map((j) => j.id)) : null;
    return db.notes
      .filter((n) => (f.jobId ? n.job_id === f.jobId : (n.project_id === f.projectId || (n.job_id && jobIds?.has(n.job_id)))))
      .filter((n) => w.staff || (n.job_id && w.canJob(n.job_id)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((n) => ({ ...n, author_name: labelOf(db, n.author_id), author_color: colorOf(db, n.author_id) }));
  },
  async addNote(n) {
    const w = await who();
    if (!w.staff && !(n.job_id && w.canJob(n.job_id) && !n.project_id && !n.customer_id)) throw new Error("permission denied (mock RLS)");
    mutate((db) => { db.notes.push({ id: randomUUID(), customer_id: n.customer_id ?? null, project_id: n.project_id ?? null, job_id: n.job_id ?? null, body: n.body, author_id: w.uid, created_at: now() }); });
  },
  async listMessages(f) {
    const w = await who(); if (!w.staff) return [];
    const db = load();
    return db.messages.filter((m) => (!f.customerId || m.customer_id === f.customerId) && (!f.projectId || m.project_id === f.projectId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m) => ({ ...m, sender_name: labelOf(db, m.sent_by), sender_color: colorOf(db, m.sent_by) }));
  },
  async logMessage(m) {
    const w = await who(); requireStaffMock(w);
    mutate((db) => { db.messages.push({ ...m, id: randomUUID(), sent_by: w.uid, created_at: now() }); });
  },

  // ---------------------------------------------------------------- service requests (staff only; tech: the ticket behind their visit)
  async pageServiceRequests(f) {
    requireStaffMock(await who());
    const db = load();
    const views = db.service_requests.map((x) => viewSR(db, x)).sort((a, b) => b.received_at.localeCompare(a.received_at) || a.id.localeCompare(b.id));
    const counts: Record<string, number> = {};
    for (const st of ["open", "all", ...SR_STATUSES] as const) counts[st] = views.filter((v) => srMatches(v, f, st)).length;
    const page = mockPage(views.filter((v) => srMatches(v, f, f.status ?? "open")), f.page, f.size);
    return { ...page, items: applyTicketVisits(page.items, ticketVisitsFor(db, page.items.map((t) => t.id))), counts };
  },
  async countOpenServiceRequests() {
    const w = await who(); if (!w.staff) return 0;
    return load().service_requests.filter((x) => SR_OPEN.includes(x.status)).length;
  },
  async getServiceRequest(id) {
    const w = await who(); const db = load();
    const sr = db.service_requests.find((x) => x.id === id);
    if (!sr) return null;
    if (!w.staff && !db.jobs.some((j) => j.service_request_id === id && w.canJob(j.id))) return null;
    return viewSR(db, sr);
  },
  async createServiceRequest(input) {
    const w = await who(); requireStaffMock(w);
    if (!input.summary.trim()) throw new Error("summary is required");
    return mutate((db) => {
      const number = Math.max(1000, ...db.service_requests.map((x) => x.number)) + 1;
      const sr: ServiceRequest = { ...input, id: randomUUID(), number, status: "new", billable: false, assignee_id: input.assignee_id ?? null, converted_project_id: null,
        resolved_at: null, resolved_by: null, resolved_job_id: null, created_by: w.uid, created_at: now(), updated_at: now(), ...emptyGeocode() };
      db.service_requests.push(sr);
      db.sr_events.push({ id: randomUUID(), request_id: sr.id, kind: "created", body: `Logged from ${input.channel === "email" ? "an email" : input.channel === "call" ? "a phone call" : "another channel"}.`, actor_id: w.uid, created_at: now() });
      return sr;
    });
  },
  async updateServiceRequest(id, patch) {
    requireStaffMock(await who());
    mutate((db) => {
      const sr = db.service_requests.find((x) => x.id === id);
      if (!sr) throw new Error("Service request not found or not allowed");
      Object.assign(sr, patch, { updated_at: now() });
    });
  },
  async listServiceRequestEvents(requestId) {
    const w = await who(); if (!w.staff) return [];
    const db = load();
    return db.sr_events.filter((e) => e.request_id === requestId).sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ ...e, actor_name: e.actor_id ? labelOf(db, e.actor_id) : "System", actor_color: colorOf(db, e.actor_id) }));
  },
  async addServiceRequestEvent(requestId, e) {
    const w = await who(); requireStaffMock(w);
    if (e.kind === "note" && !e.body.trim()) throw new Error("note is empty");
    mutate((db) => { db.sr_events.push({ id: randomUUID(), request_id: requestId, kind: e.kind, body: e.body, actor_id: w.uid, created_at: now() }); });
  },
  async findProjects(f) {
    requireStaffMock(await who());
    const db = load();
    const term = (f.q ?? "").trim().toLowerCase();
    if (!term && !f.customerId) return [];
    const limit = Math.min(Math.max(1, f.limit ?? 10), 25);
    const cname = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "";
    return db.projects
      .filter((p) => p.status !== "cancelled" && (!f.customerId || p.customer_id === f.customerId) && (!term || `${p.name} ${cname(p.customer_id)}`.toLowerCase().includes(term)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit)
      .map((p): ProjectPick => ({ id: p.id, name: p.name, type: p.type, status: p.status, customer_id: p.customer_id, customer_name: cname(p.customer_id),
        completed_at: projectDates(db.jobs.filter((j) => j.project_id === p.id)).completed_date, warranty_months: p.warranty_months ?? DEFAULT_WARRANTY_MONTHS }));
  },

  async listFleetVehicles() {
    const w = await who();
    if (!w.fleetAccess) return [];
    const rows = load().fleet_vehicles ?? [];
    if (w.role === "tech") return rows.filter((r) => r.profile_id === w.uid);
    return rows;
  },
  async setFleetVehicleMapping(deviceId, patch) {
    const w = await who();
    if (w.role !== "admin") throw new Error("permission denied (mock RLS)");
    mutate((db) => {
      const existing = db.fleet_vehicles.find((r) => r.geotab_device_id === deviceId);
      if (existing) {
        if (patch.label !== undefined) existing.label = patch.label;
        if (patch.profile_id !== undefined) existing.profile_id = patch.profile_id;
      } else {
        db.fleet_vehicles.push({ geotab_device_id: deviceId, label: patch.label ?? null, profile_id: patch.profile_id ?? null });
      }
    });
  },
  async setFleetAccess(profileId, access) {
    const w = await who();
    if (w.role !== "admin") throw new Error("permission denied (mock RLS)");
    mutate((db) => {
      const prof = db.profiles.find((x) => x.id === profileId);
      if (prof && !prof.deleted_at) prof.fleet_access = access;
    });
  },
  async setCustomerGeocode(id, patch) {
    mutate((db) => { const c = db.customers.find((x) => x.id === id); if (c) Object.assign(c, patch); });
  },
  async setServiceRequestGeocode(id, patch) {
    mutate((db) => { const sr = db.service_requests.find((x) => x.id === id); if (sr) Object.assign(sr, patch); });
  },
};

function mockPage<T>(all: T[], page: number, size = PAGE_SIZE) {
  const n = Math.min(Math.max(1, size), 200);
  const last = Math.max(1, Math.ceil(all.length / n));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), last);
  return { items: all.slice((p - 1) * n, p * n), total: all.length, page: p, size: n };
}
