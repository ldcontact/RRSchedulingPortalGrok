import "server-only";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mergeTeam, type Repo } from "./repo";
import type { Contact, Customer, Invite, Profile } from "@/lib/types";

/*
 * DEV MOCK MODE data layer. Persists to .mock-db.json in the project root
 * (git-ignored). Delete that file to reset the sample data. Never used when
 * NEXT_PUBLIC_RR_MOCK_MODE is unset.
 */
type DB = { profiles: Profile[]; invites: Invite[]; customers: Customer[]; contacts: Contact[] };
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
  return { profiles, invites, customers, contacts };
}

function load(): DB {
  if (!existsSync(FILE)) { const db = seed(); save(db); return db; }
  return JSON.parse(readFileSync(FILE, "utf8")) as DB;
}
function save(db: DB) { writeFileSync(FILE, JSON.stringify(db, null, 2)); }
function mutate<T>(fn: (db: DB) => T): T { const db = load(); const r = fn(db); save(db); return r; }

export function mockProfiles() { return load().profiles; }

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
    return { customers: db.customers.length, team: db.profiles.filter((p) => p.role && p.active).length, invited: db.invites.filter((i) => !i.accepted_at).length };
  },
};
