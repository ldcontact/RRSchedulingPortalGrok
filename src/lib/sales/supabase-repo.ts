import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalesActivity, SalesAlert, SalesAutomation, SalesDeal, SalesInboxItem, SalesProposal, SalesProposalItem } from "./types";
import type { LeadInput, SalesRepo } from "./repo";
import { planConvert } from "./convert";
import { signProposal } from "./proposals";
import { sendEmail } from "@/lib/email";
import { sendSms } from "./sms";
import { bookingToken } from "./booking";
import { coordsForDeal } from "./geocode-deal";

type DealRow = SalesDeal;
function asDeal(row: DealRow): SalesDeal { return row; }

async function withDealGeocode(deal: SalesDeal, prev: SalesDeal | null, isNew: boolean): Promise<SalesDeal> {
  try {
    const next = await coordsForDeal(deal, prev, isNew, { lat: deal.lat, lng: deal.lng });
    if (next === "skip" || (next.lat === deal.lat && next.lng === deal.lng)) return deal;
    const c = await sb();
    const { data, error } = await c.from("sales_deals").update({ lat: next.lat, lng: next.lng }).eq("id", deal.id).select("*").single();
    if (error || !data) return deal;
    return asDeal(data as DealRow);
  } catch {
    return deal;
  }
}


async function sb() {
  return createClient();
}

export function supabaseSalesRepo(): SalesRepo {
  return {
    async listDeals(f = {}) {
      const c = await sb();
      let q = c.from("sales_deals").select("*").order("title");
      if (f.pipeline) q = q.eq("pipeline_slug", f.pipeline);
      if (f.stage) q = q.eq("stage_slug", f.stage);
      if (f.owner) q = q.eq("owner_id", f.owner);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as SalesDeal[];
      const s = (f.q ?? "").trim().toLowerCase();
      return s ? rows.filter((d) => [d.title, d.contact_name, d.city, d.address].join(" ").toLowerCase().includes(s)) : rows;
    },
    async getDeal(id) {
      const c = await sb();
      const { data, error } = await c.from("sales_deals").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? asDeal(data as DealRow) : null;
    },
    async createDeal(input) {
      const c = await sb();
      const { data, error } = await c.from("sales_deals").insert(input).select("*").single();
      if (error) throw error;
      return withDealGeocode(asDeal(data as DealRow), null, true);
    },
    async updateDeal(id, patch) {
      const c = await sb();
      const prev = (await c.from("sales_deals").select("*").eq("id", id).maybeSingle()).data as DealRow | null;
      const { data, error } = await c.from("sales_deals").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) throw error;
      return withDealGeocode(asDeal(data as DealRow), prev ? asDeal(prev) : null, false);
    },
    async deleteDeal(id) {
      const c = await sb();
      const { error } = await c.from("sales_deals").delete().eq("id", id);
      if (error) throw error;
    },
    async moveStage(id, stage) { return this.updateDeal(id, { stage_slug: stage }); },
    async listInbox() {
      const c = await sb();
      const { data, error } = await c.from("sales_inbox").select("*").eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalesInboxItem[];
    },
    async ingestLead(input) {
      const admin = createAdminClient();
      if (!admin) throw new Error("Lead ingest needs the server admin client (not configured).");
      const { data, error } = await admin.rpc("ingest_sales_lead", {
        p_source: input.source,
        p_name: input.name,
        p_phone: input.phone ?? null,
        p_email: input.email ?? null,
        p_address: input.address ?? null,
        p_city: input.city ?? null,
        p_state: input.state ?? null,
        p_zip: input.zip ?? null,
        p_pipeline: input.pipeline_slug ?? "single_family_whe",
        p_message: input.message ?? null,
        p_raw: input.raw ?? null,
      });
      if (error) throw error;
      const id = data as string;
      const { data: row } = await admin.from("sales_inbox").select("*").eq("id", id).single();
      return row as SalesInboxItem;
    },
    async acceptInbox(id, opts) {
      const item = (await this.listInbox()).find((i) => i.id === id);
      const c = await sb();
      const found = item ?? (await c.from("sales_inbox").select("*").eq("id", id).single()).data as SalesInboxItem;
      if (!found) throw new Error("Inbox item not found");
      const deal = await this.createDeal({
        title: found.address || found.name,
        pipeline_slug: found.pipeline_slug,
        stage_slug: "potential_lead",
        contact_name: found.name,
        contact_phone: found.phone,
        contact_email: found.email,
        address: found.address,
        city: found.city,
        state: found.state,
        zip: found.zip,
        source: found.source,
        notes: found.message,
        owner_id: opts?.owner_id ?? null,
      });
      await c.from("sales_inbox").update({ status: "accepted", accepted_deal_id: deal.id }).eq("id", id);
      return deal;
    },
    async dismissInbox(id) {
      const c = await sb();
      const { error } = await c.from("sales_inbox").update({ status: "dismissed" }).eq("id", id);
      if (error) throw error;
    },
    async listActivities(dealId) {
      const c = await sb();
      const { data, error } = await c.from("sales_activities").select("*").eq("deal_id", dealId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalesActivity[];
    },
    async addActivity(input) {
      const c = await sb();
      const { data, error } = await c.from("sales_activities").insert(input).select("*").single();
      if (error) throw error;
      return data as SalesActivity;
    },
    async sendDraft(activityId) {
      const c = await sb();
      const { data: act, error } = await c.from("sales_activities").select("*").eq("id", activityId).single();
      if (error || !act) throw error ?? new Error("Draft not found");
      const row = act as SalesActivity;
      if (row.kind === "sms") {
        const result = await sendSms({ to: row.to_address ?? "", body: row.body });
        if (result.skipped) return row;
        const { data } = await c.from("sales_activities").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", activityId).select("*").single();
        return data as SalesActivity;
      }
      if (row.kind === "email") {
        const result = await sendEmail({ to: row.to_address ?? "", subject: row.subject ?? "Message from Retrofit Rebates", text: row.body });
        if (result.skipped) return row;
        const { data } = await c.from("sales_activities").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", activityId).select("*").single();
        return data as SalesActivity;
      }
      throw new Error("Only email or SMS drafts can be sent");
    },
    async listAutomations() {
      const c = await sb();
      const { data, error } = await c.from("sales_automations").select("*").order("name");
      if (error) throw error;
      return ((data ?? []) as SalesAutomation[]).map((r) => ({ ...r, actions: r.actions ?? [] }));
    },
    async upsertAutomation(row) {
      const c = await sb();
      const { data, error } = row.id
        ? await c.from("sales_automations").update(row).eq("id", row.id).select("*").single()
        : await c.from("sales_automations").insert(row).select("*").single();
      if (error) throw error;
      return data as SalesAutomation;
    },
    async runStuckScan() { return 0; },
    async listAlerts() {
      const c = await sb();
      const { data, error } = await c.from("sales_alerts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalesAlert[];
    },
    async markAlertRead(id) {
      const c = await sb();
      await c.from("sales_alerts").update({ read_at: new Date().toISOString() }).eq("id", id);
    },
    async listProposals(dealId) {
      const c = await sb();
      const { data, error } = await c.from("sales_proposals").select("*").eq("deal_id", dealId);
      if (error) throw error;
      const ids = (data ?? []).map((p: { id: string }) => p.id);
      const items = ids.length ? (await c.from("sales_proposal_items").select("*").in("proposal_id", ids)).data ?? [] : [];
      return (data ?? []).map((p: SalesProposal) => ({
        ...p,
        items: (items as SalesProposalItem[]).filter((i) => (i as SalesProposalItem & { proposal_id?: string }).proposal_id === p.id).sort((a, b) => a.sort - b.sort),
      }));
    },
    async upsertProposal(input) {
      const c = await sb();
      const net = input.items.reduce((s, i) => s + i.amount, 0);
      const payload = { deal_id: input.deal_id, title: input.title, notes: input.notes ?? null, net, public_token: bookingToken() };
      const { data, error } = input.id
        ? await c.from("sales_proposals").update(payload).eq("id", input.id).select("*").single()
        : await c.from("sales_proposals").insert({ ...payload, status: "draft" }).select("*").single();
      if (error) throw error;
      const id = (data as SalesProposal).id;
      if (input.id) await c.from("sales_proposal_items").delete().eq("proposal_id", id);
      if (input.items.length) {
        await c.from("sales_proposal_items").insert(input.items.map((it, i) => ({ proposal_id: id, label: it.label, amount: it.amount, sort: i })));
      }
      const list = await this.listProposals(input.deal_id);
      return list.find((p) => p.id === id)!;
    },
    async sendProposal(id) {
      const c = await sb();
      const { data, error } = await c.from("sales_proposals").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) throw error;
      return { ...(data as SalesProposal), items: [] };
    },
    async getProposalByToken(token) {
      const admin = createAdminClient();
      const c = admin ?? await sb();
      const { data } = await c.from("sales_proposals").select("*").eq("public_token", token).maybeSingle();
      if (!data) return null;
      const p = data as SalesProposal;
      const items = (await c.from("sales_proposal_items").select("*").eq("proposal_id", p.id)).data ?? [];
      const deal = (await c.from("sales_deals").select("title").eq("id", p.deal_id).maybeSingle()).data as { title?: string } | null;
      return { ...p, items: items as SalesProposalItem[], deal_title: deal?.title ?? p.title };
    },
    async signProposalByToken(token, input) {
      const current = await this.getProposalByToken(token);
      if (!current) throw new Error("Proposal not found");
      const result = signProposal({ proposal: current, dealStage: "", signerName: input.signerName, consent: input.consent, method: input.method });
      if (!result.ok) throw new Error(result.error);
      const admin = createAdminClient();
      if (admin) {
        const { error } = await admin.rpc("sign_sales_proposal", {
          p_token: token, p_signer_name: input.signerName, p_consent: input.consent, p_method: input.method,
        });
        if (error) throw error;
        return (await this.getProposalByToken(token))!;
      }
      throw new Error("Signing is not configured on this server.");
    },
    async convertDeal(id, visit) {
      const deal = await this.getDeal(id);
      if (!deal) throw new Error("Deal not found");
      const plan = planConvert({ deal, visit: visit ?? null });
      if (!plan.ok) throw new Error(plan.error);
      const c = await sb();
      const { data, error } = await c.rpc("convert_sales_deal", {
        p_deal_id: id,
        p_visit_start: visit?.starts_at ?? null,
        p_visit_end: visit?.ends_at ?? null,
      });
      if (error) throw error;
      const next = await this.getDeal(id);
      return { projectId: data as string, deal: next! };
    },
    async createBookingLink(dealId) {
      const token = bookingToken();
      await this.updateDeal(dealId, { } as Partial<SalesDeal>);
      const c = await sb();
      await c.from("sales_deals").update({ booking_token: token }).eq("id", dealId);
      return token;
    },
    async getDealByBookingToken(token) {
      const admin = createAdminClient();
      const c = admin ?? await sb();
      const { data } = await c.from("sales_deals").select("*").eq("booking_token", token).maybeSingle();
      return data ? asDeal(data as DealRow) : null;
    },
    async bookAssessment(token, slot) {
      const deal = await this.getDealByBookingToken(token);
      if (!deal) throw new Error("Booking link is not valid");
      const admin = createAdminClient();
      const c = admin ?? await sb();
      const { data, error } = await c.from("sales_deals").update({
        assessment_date: slot.starts_at.slice(0, 10),
        assessment_starts_at: slot.starts_at,
        assessment_ends_at: slot.ends_at,
        stage_slug: "assessment_scheduled",
        updated_at: new Date().toISOString(),
      }).eq("id", deal.id).select("*").single();
      if (error) throw error;
      return asDeal(data as DealRow);
    },
    async listOccupiedWindows(fromIso, toIso) {
      const { getRepo } = await import("@/lib/data/repo");
      const jobs = await (await getRepo()).listJobs({ from: fromIso, to: toIso });
      return jobs.filter((j) => j.status !== "cancelled").map((j) => ({ starts_at: j.starts_at, ends_at: j.ends_at }));
    },
    async importDeals(deals, meta) {
      void meta;
      let imported = 0, skipped = 0;
      for (const row of deals) {
        const existing = (await (await sb()).from("sales_deals").select("id").eq("monday_item_id", row.monday_item_id).eq("monday_board_id", row.monday_board_id).maybeSingle()).data;
        if (existing) { skipped += 1; continue; }
        await this.createDeal({
          title: row.title,
          pipeline_slug: row.pipeline_slug,
          stage_slug: row.stage_slug,
          contact_name: row.contact_name,
          contact_phone: row.contact_phone,
          address: row.address,
          city: row.city,
          state: row.state,
          zip: row.zip,
          priority: row.priority,
          source: "monday",
          assessment_date: row.assessment_date,
          scheduled_date: row.scheduled_date,
          close_date: row.close_date,
          opened_at: row.opened_at ? `${row.opened_at}T12:00:00.000Z` : undefined,
          monday_item_id: row.monday_item_id,
          monday_board_id: row.monday_board_id,
          notes: row.owner_name ? `Monday owner: ${row.owner_name}` : null,
        });
        imported += 1;
      }
      return { imported, skipped };
    },
    async ownerDirectory() {
      const c = await sb();
      const { data } = await c.from("profiles").select("id, full_name, color");
      const out: Record<string, { name: string; color: string }> = {};
      for (const row of data ?? []) {
        const p = row as { id: string; full_name: string; color: string | null };
        out[p.id] = { name: p.full_name, color: p.color || "#0f766e" };
      }
      return out;
    },
    async ownerNames() {
      const dir = await this.ownerDirectory();
      return Object.fromEntries(Object.entries(dir).map(([id, o]) => [id, o.name]));
    },
  };
}

export async function ingestLeadPublic(input: LeadInput) {
  return supabaseSalesRepo().ingestLead(input);
}
