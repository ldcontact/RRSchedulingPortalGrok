import type { Contact, ContactInput, Customer, CustomerInput, CustomerListItem, InviteInput, Profile, TeamMember } from "@/lib/types";

/**
 * Data access used by pages and server actions. Two implementations:
 *  - supabase-repo.ts: real Postgres via Supabase, RLS enforced as the signed-in user
 *  - mock-repo.ts:     DEV MOCK MODE only, a local JSON file (.mock-db.json)
 * Callers also re-check roles before mutating (defense in depth on top of RLS).
 */
export interface Repo {
  listCustomers(q?: string): Promise<CustomerListItem[]>;
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

  counts(): Promise<{ customers: number; team: number; invited: number }>;
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
  invites: { email: string; role: TeamMember["role"]; full_name: string; title: string | null; phone: string | null; color: string; invited_at: string; accepted_at: string | null }[],
): TeamMember[] {
  const byEmail = new Map<string, TeamMember>();
  for (const p of profiles) {
    if (!p.role && !invites.some((i) => i.email === p.email)) continue; // signed in but not on the team list
    byEmail.set(p.email, {
      email: p.email, full_name: p.full_name, role: p.role, title: p.title, phone: p.phone, color: p.color,
      profile_id: p.id, status: p.active ? "active" : "inactive", invited_at: null,
    });
  }
  for (const i of invites) {
    const existing = byEmail.get(i.email);
    if (existing) { existing.invited_at = i.invited_at; continue; }
    byEmail.set(i.email, {
      email: i.email, full_name: i.full_name, role: i.role, title: i.title, phone: i.phone, color: i.color,
      profile_id: null, status: "invited", invited_at: i.invited_at,
    });
  }
  const order = { admin: 0, manager: 1, tech: 2 } as const;
  return [...byEmail.values()].sort((a, b) => (order[a.role ?? "tech"] - order[b.role ?? "tech"]) || a.full_name.localeCompare(b.full_name));
}
