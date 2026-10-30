import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mergeTeam, type Repo } from "./repo";
import type { Contact, Customer, CustomerListItem, Profile } from "@/lib/types";

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

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
        s.from("profiles").select("*"),
        s.from("invites").select("*"), // RLS: admins only; others get []
      ]);
      fail(e1);
      return mergeTeam((profiles ?? []) as Profile[], invites ?? []);
    },
    async getProfile(id) {
      const { data, error } = await (await db()).from("profiles").select("*").eq("id", id).maybeSingle();
      fail(error);
      return data as Profile | null;
    },
    async upsertInvite(input) {
      fail((await (await db()).from("invites").upsert({ ...input, email: input.email.toLowerCase() })).error);
    },
    async removeFromTeam(email) {
      fail((await (await db()).from("invites").delete().eq("email", email.toLowerCase())).error);
    },
    async setActive(profileId, active) {
      fail((await (await db()).from("profiles").update({ active }).eq("id", profileId)).error);
    },
    async counts() {
      const s = await db();
      const [c, t, i] = await Promise.all([
        s.from("customers").select("id", { count: "exact", head: true }),
        s.from("profiles").select("id", { count: "exact", head: true }).not("role", "is", null),
        s.from("invites").select("email", { count: "exact", head: true }).is("accepted_at", null),
      ]);
      return { customers: c.count ?? 0, team: t.count ?? 0, invited: i.count ?? 0 };
    },
  };
}
