import "server-only";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { mergeTeam, type Repo } from "./repo";
import type { Contact, Customer, Invite, Job, JobView, Message, Milestone, Note, Photo, Profile, Project, ProjectStatus } from "@/lib/types";
import { addDays, dayKey, todayKey, zonedToUtc } from "@/lib/time";

/*
 * DEV MOCK MODE data layer. Persists to .mock-db.json in the project root
 * (git-ignored). Delete that file to reset the sample data. Never used when
 * NEXT_PUBLIC_RR_MOCK_MODE is unset.
 */
type PhotoRow = Omit<Photo, "url">;
type NoteRow = Omit<Note, "author_name">;
type MessageRow = Omit<Message, "sender_name">;
type P2 = { projects: Project[]; milestones: Milestone[]; jobs: Job[]; assignments: { job_id: string; profile_id: string }[]; photos: PhotoRow[]; notes: NoteRow[]; messages: MessageRow[] };
type DB = { profiles: Profile[]; invites: Invite[]; customers: Customer[]; contacts: Contact[] } & P2;
export const MOCK_UPLOADS = join(process.cwd(), ".mock-uploads");
const FILE = join(process.cwd(), ".mock-db.json");

const now = () => new Date().toISOString();
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

function seed(): DB {
  const p = (id: string, email: string, full_name: string, role: Profile["role"], title: string, phone: string, color: string): Profile =>
    ({ id, email, full_name, role, title, phone, color, active: true });
  const profiles = [
    p("u-admin", "luke@retrofitrebates.com", "Luke Dlugosz", "admin", "Owner / President", "(847) 555-0100", "#0f766e"),
    p("u-manager", "maria.santos@gmail.com", "Maria Santos", "manager", "Operations Manager", "(847) 555-0101", "#7c3aed"),
    p("u-tech1", "carlos.mendez@yahoo.com", "Carlos Mendez", "tech", "Lead Electrician", "(847) 555-0102", "#ea580c"),
    p("u-tech2", "jake.sullivan@gmail.com", "Jake Sullivan", "tech", "Electrician", "(847) 555-0103", "#2563eb"),
    p("u-tech3", "andre.w@outlook.com", "Andre Williams", "tech", "HVAC Technician", "(847) 555-0104", "#db2777"),
    p("u-tech4", "emily.chen@icloud.com", "Emily Chen", "tech", "Electrician", "(847) 555-0105", "#16a34a"),
    p("u-stranger", "someone.else@gmail.com", "Someone Else", null, "", "", "#64748b"),
  ];
  const invites: Invite[] = profiles.filter((x) => x.role).map((x) => ({
    email: x.email, role: x.role!, full_name: x.full_name, phone: x.phone, title: x.title, color: x.color, invited_at: ago(40), accepted_at: ago(39),
  }));
  invites.push({ email: "sam.ortiz@gmail.com", role: "tech", full_name: "Sam Ortiz", phone: "(630) 555-0177", title: "Apprentice Electrician", color: "#0891b2", invited_at: ago(1), accepted_at: null });
  const c = (id: string, name: string, phone: string, email: string, address: string, city: string, zip: string, tags: string[], notes: string, days: number): Customer =>
    ({ id, name, phone, email, address, city, state: "IL", zip, tags, notes, created_at: ago(days), updated_at: ago(days) });
  const customers = [
    c("c1", "Lakeview Family Dental", "(847) 555-0141", "office@lakeviewdental.example", "1420 W Algonquin Rd", "Arlington Heights", "60005", ["ComEd SB", "Lighting"], "Office manager is Janet. Prefers texts. Closes 1pm Fridays.", 60),
    c("c2", "Golf Road Auto Body", "(847) 555-0152", "tony@golfrdautobody.example", "905 E Golf Rd", "Schaumburg", "60173", ["ComEd SB", "Lighting"], "Shop opens 7am. Bay 4 is clear for the lift.", 45),
    c("c3", "Prairie Bean Coffee Co.", "(847) 555-0163", "megan@prairiebean.example", "38 N Brockway St", "Palatine", "60067", ["ComEd SB", "HVAC"], "Roof access via rear ladder; lockbox code with Maria.", 30),
    c("c4", "Elk Grove Precision Machining", "(847) 555-0174", "dkowalski@egprecision.example", "2250 Lunt Ave", "Elk Grove Village", "60007", ["ComEd SB", "Lighting", "Large"], "Safety glasses and steel toes required on the floor.", 40),
    c("c5", "Hoffman Estates Self Storage", "(847) 555-0185", "linda@hestorage.example", "1600 W Higgins Rd", "Hoffman Estates", "60169", ["ComEd SB", "Lighting"], "Gate code 4417#. Buildings A–E.", 25),
    c("c6", "Northwest Fitness Studio", "(847) 555-0196", "jamal@nwfitness.example", "3315 Kirchoff Rd", "Rolling Meadows", "60008", ["Lead", "HVAC"], "Wants HVAC tune-up + lighting assessment. Busy 5–8pm.", 6),
    c("c7", "Itasca Print & Sign", "(630) 555-0127", "rosa@itascaprint.example", "510 W Irving Park Rd", "Itasca", "60143", ["Lead"], "Referred by Golf Road Auto Body.", 3),
    c("c8", "Roselle Family Pharmacy", "(630) 555-0138", "ken@rosellerx.example", "122 E Irving Park Rd", "Roselle", "60172", ["Lead", "Lighting"], "Asked about the free ComEd assessment.", 2),
  ];
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
  return { profiles, invites, customers, contacts, ...seedPhase2() };
}

/** Sample projects/visits placed around today so the schedule always has something to show. */
function seedPhase2(): P2 {
  const T = todayKey();
  const at = (dayOffset: number, h: number, m = 0) => zonedToUtc(addDays(T, dayOffset), h * 60 + m);
  const pr = (id: string, customer_id: string, name: string, type: Project["type"], scope: string, value: number, est_rebate: number, extra: Partial<Project> = {}): Project => ({
    id, customer_id, name, type, status: "proposed", scope, value, est_rebate, timeline_sent_at: null, timeline_sent_via: null, timeline_approved_at: null,
    created_at: ago(20), updated_at: ago(1), ...extra,
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
    approved_at: null, approved_by: null, review_note: null, ...extra,
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
  const ph = (project_id: string, job_id: string | null, kind: Photo["kind"], caption: string, days: number, by: string): PhotoRow =>
    ({ id: randomUUID(), project_id, job_id, kind, storage_path: `seed/${kind}/${encodeURIComponent(caption)}.svg`, caption, uploaded_by: by, created_at: ago(days) });
  const photos = [
    ph("p1", null, "before", "Lobby – T8 troffers", 20, "u-manager"), ph("p1", null, "before", "Operatory 3 ceiling", 20, "u-manager"), ph("p1", null, "before", "Hallway fixtures", 20, "u-manager"),
    ph("p2", null, "before", "Bay 2 metal halides", 14, "u-admin"), ph("p2", null, "before", "Exterior wall pack", 14, "u-admin"),
    ph("p3", null, "before", "RTU #1 filters", 7, "u-manager"), ph("p3", null, "before", "Old thermostat", 7, "u-manager"),
    ph("p4", null, "before", "Production floor", 5, "u-admin"), ph("p4", null, "before", "Make-up air unit", 5, "u-admin"),
    ph("p3", "j5", "completion", "RTU #1 new filters", 1, "u-tech3"), ph("p3", "j5", "completion", "Smart thermostat installed", 1, "u-tech3"),
    ph("p1", "j1", "completion", "Lobby LED panels", 2, "u-tech1"),
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
  const db = { projects, milestones, jobs, assignments, photos, notes, messages };
  for (const p of projects) syncProject(db, p.id);
  return db;
}

/** Mirrors the sync_project_status() trigger. */
function syncProject(db: Pick<P2, "projects" | "jobs">, projectId: string) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p || p.status === "cancelled") return;
  const st = db.jobs.filter((j) => j.project_id === projectId && j.status !== "cancelled").map((j) => j.status);
  const next: ProjectStatus | null = st.includes("completed") ? "awaiting_review" : st.includes("in_progress") ? "in_progress" : st.includes("scheduled") ? "scheduled" : st.includes("approved") ? "complete" : null;
  if (next && next !== p.status) { p.status = next; p.updated_at = now(); }
}

function load(): DB {
  if (!existsSync(FILE)) { const db = seed(); save(db); return db; }
  const db = JSON.parse(readFileSync(FILE, "utf8")) as DB;
  if (!db.projects) { Object.assign(db, seedPhase2()); save(db); } // upgrade a phase-1 mock DB
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
  const myJobs = new Set(db.assignments.filter((a) => a.profile_id === uid).map((a) => a.job_id));
  const myProjects = new Set(db.jobs.filter((j) => myJobs.has(j.id)).map((j) => j.project_id));
  return { uid, role, staff, canJob: (id: string) => staff || myJobs.has(id), canProject: (id: string) => staff || myProjects.has(id) };
}
function requireStaffMock(w: { staff: boolean }) { if (!w.staff) throw new Error("permission denied (mock RLS)"); }

function viewJob(db: DB, j: Job): JobView {
  const p = db.projects.find((x) => x.id === j.project_id)!;
  const c = db.customers.find((x) => x.id === p.customer_id);
  const addr = c ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : null;
  const assignees = db.assignments.filter((a) => a.job_id === j.id).map((a) => db.profiles.find((x) => x.id === a.profile_id)).filter(Boolean)
    .map((x) => ({ id: x!.id, full_name: x!.full_name, color: x!.color }));
  return { ...j, project_name: p.name, project_type: p.type, customer_id: p.customer_id, customer_name: c?.name ?? "", address: addr || null, assignees };
}
const nameOf = (db: DB, id: string | null) => db.profiles.find((p) => p.id === id)?.full_name ?? "Someone";

export const mockRepo: Repo = {
  async listCustomers(q) {
    const db = load();
    const term = q?.toLowerCase().trim();
    return db.customers
      .map((c) => {
        const cs = db.contacts.filter((x) => x.customer_id === c.id);
        return { ...c, primary_contact: cs.find((x) => x.is_primary)?.name ?? cs[0]?.name ?? null, project_count: 0 };
      })
      .filter((c) => !term || [c.name, c.city, c.email, c.phone, c.primary_contact, ...c.tags].join(" ").toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async getCustomer(id) { return load().customers.find((c) => c.id === id) ?? null; },
  async createCustomer(input) {
    return mutate((db) => { const c: Customer = { ...input, id: randomUUID(), created_at: now(), updated_at: now() }; db.customers.push(c); return c; });
  },
  async updateCustomer(id, input) {
    mutate((db) => { const c = db.customers.find((x) => x.id === id); if (!c) throw new Error("Customer not found"); Object.assign(c, input, { updated_at: now() }); });
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

  async listTeam() { const db = load(); return mergeTeam(db.profiles, db.invites); },
  async getProfile(id) { return load().profiles.find((p) => p.id === id) ?? null; },
  async upsertInvite(input) {
    mutate((db) => {
      const email = input.email.toLowerCase();
      const existing = db.invites.find((i) => i.email === email);
      if (existing) Object.assign(existing, input, { email });
      else db.invites.push({ ...input, email, invited_at: now(), accepted_at: null });
      const prof = db.profiles.find((p) => p.email === email); // mirrors the sync_invite_to_profile trigger
      if (prof) {
        Object.assign(prof, { role: input.role, full_name: input.full_name || prof.full_name, title: input.title, phone: input.phone, color: input.color });
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
  async setActive(profileId, active) { mutate((db) => { const p = db.profiles.find((x) => x.id === profileId); if (p) p.active = active; }); },
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
    const term = f.q?.toLowerCase().trim();
    const nowIso = now();
    return db.projects
      .filter((p) => w.canProject(p.id) && (!f.status || p.status === f.status) && (!f.customerId || p.customer_id === f.customerId))
      .map((p) => {
        const jobs = db.jobs.filter((j) => j.project_id === p.id && j.status !== "cancelled");
        const team = new Map<string, { id: string; full_name: string; color: string }>();
        for (const j of jobs) for (const a of viewJob(db, j).assignees) team.set(a.id, a);
        const ms = db.milestones.filter((m) => m.project_id === p.id);
        return {
          ...p, customer_name: db.customers.find((c) => c.id === p.customer_id)?.name ?? "",
          next_visit: jobs.filter((j) => j.ends_at > nowIso && (j.status === "scheduled" || j.status === "in_progress")).map((j) => j.starts_at).sort()[0] ?? null,
          team: [...team.values()], done_milestones: ms.filter((m) => m.done).length, total_milestones: ms.length,
        };
      })
      .filter((p) => !term || `${p.name} ${p.customer_name} ${p.scope}`.toLowerCase().includes(term))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async getProject(id) { const w = await who(); return w.canProject(id) ? load().projects.find((p) => p.id === id) ?? null : null; },
  async createProject(input) {
    requireStaffMock(await who());
    return mutate((db) => {
      const p: Project = { ...input, id: randomUUID(), timeline_sent_at: null, timeline_sent_via: null, timeline_approved_at: null, created_at: now(), updated_at: now() };
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
    return load().profiles.filter((p) => p.role && p.active).sort((a, b) => order[a.role!] - order[b.role!] || a.full_name.localeCompare(b.full_name))
      .map((p) => ({ id: p.id, full_name: p.full_name, color: p.color, role: p.role! }));
  },
  async listJobs(f = {}) {
    const w = await who(); const db = load();
    return db.jobs
      .filter((j) => w.canJob(j.id) && (!f.projectId || j.project_id === f.projectId) && (!f.status || f.status.includes(j.status))
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
      db.jobs.push({ ...input, id, status: "scheduled", started_at: null, completed_at: null, completed_by: null, approved_at: null, approved_by: null, review_note: null });
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
          if (!db.photos.some((p) => p.job_id === id && p.kind === "completion") || !db.notes.some((n) => n.job_id === id))
            throw new Error("add at least one completion photo and a note before submitting");
          Object.assign(patch, { completed_at: now(), completed_by: w.uid });
        }
        if (patch.status === "in_progress") Object.assign(patch, { started_at: now() });
      }
      Object.assign(j, patch);
      syncProject(db, j.project_id);
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
      .map((p) => ({ ...p, url: `/api/mock-photo/${p.storage_path}` }));
  },
  async addPhoto(meta, file) {
    const w = await who();
    if (!w.staff && !(meta.kind === "completion" && meta.job_id && w.canJob(meta.job_id))) throw new Error("permission denied (mock RLS)");
    const path = `${meta.project_id}/${meta.kind}/${randomUUID()}.jpg`;
    const full = join(MOCK_UPLOADS, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(await file.arrayBuffer()));
    mutate((db) => { db.photos.push({ id: randomUUID(), ...meta, storage_path: path, uploaded_by: w.uid, created_at: now() }); });
  },
  async deletePhoto(id) { requireStaffMock(await who()); mutate((db) => { db.photos = db.photos.filter((p) => p.id !== id); }); },
  async listNotes(f) {
    const w = await who(); const db = load();
    const jobIds = f.projectId ? new Set(db.jobs.filter((j) => j.project_id === f.projectId).map((j) => j.id)) : null;
    return db.notes
      .filter((n) => (f.jobId ? n.job_id === f.jobId : (n.project_id === f.projectId || (n.job_id && jobIds?.has(n.job_id)))))
      .filter((n) => w.staff || (n.job_id && w.canJob(n.job_id)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((n) => ({ ...n, author_name: nameOf(db, n.author_id) }));
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
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m) => ({ ...m, sender_name: nameOf(db, m.sent_by) }));
  },
  async logMessage(m) {
    const w = await who(); requireStaffMock(w);
    mutate((db) => { db.messages.push({ ...m, id: randomUUID(), sent_by: w.uid, created_at: now() }); });
  },
};
