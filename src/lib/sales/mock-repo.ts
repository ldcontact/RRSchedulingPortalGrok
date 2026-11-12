import "server-only";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email";
import { DEFAULT_AUTOMATIONS, effectsFor, matchingAutomations } from "./automations";
import { bookingToken, openSlots } from "./booking";
import { planConvert } from "./convert";
import { canAccessSales, canDeleteSalesRecord, canSeeAllDeals, canViewDeal } from "./permissions";
import { signProposal } from "./proposals";
import { sendSms, smsEnabled } from "./sms";
import { loadSales, mutateSales, newId, visibleCustomerIds, type SalesDB } from "./mock-store";
import type { ImportedDeal } from "./import-monday";
import type { LeadInput, SalesRepo } from "./repo";
import type { SalesActivity, SalesAutomation, SalesDeal, SalesInboxItem, SalesProposal } from "./types";
import type { Role } from "@/lib/types";

async function actor() {
  const uid = (await cookies()).get("rr_mock_uid")?.value ?? "";
  let role: Role | null = null;
  let name = "";
  let can_delete = false;
  try {
    const { mockProfiles } = await import("@/lib/data/mock-repo");
    const p = mockProfiles().find((x) => x.id === uid);
    role = (p?.role as Role | null) ?? null;
    name = p?.full_name ?? "";
    can_delete = !!p && (p as { can_delete?: boolean }).can_delete === true;
  } catch { /* ignore */ }
  return { uid, role, name, can_delete };
}

function requireAccess(role: Role | null) {
  if (!canAccessSales(role)) throw new Error("permission denied");
}

function visible(db: SalesDB, uid: string, role: Role | null) {
  return db.deals.filter((d) => canViewDeal({ role, userId: uid, ownerId: d.owner_id }));
}

function now() { return new Date().toISOString(); }

function applyLead(input: LeadInput): SalesInboxItem {
  return {
    id: newId(),
    source: input.source,
    name: input.name.trim(),
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    pipeline_slug: input.pipeline_slug ?? "single_family_whe",
    message: input.message ?? null,
    raw: input.raw ?? null,
    status: "pending",
    accepted_deal_id: null,
    created_at: now(),
  };
}

async function fireStageAutomations(deal: SalesDeal, authorId: string | null) {
  const rules = loadSales().automations.filter((r) => r.enabled);
  const match = matchingAutomations(rules, deal, { type: "stage_entered" });
  mutateSales((db) => {
    for (const rule of match) {
      for (const effect of effectsFor(rule, deal)) {
        if (effect.kind === "activity") {
          db.activities.push({ ...effect.activity, id: newId(), author_id: authorId, created_at: now() });
        } else if (effect.kind === "alert") {
          const uid = deal.owner_id ?? authorId;
          if (uid) db.alerts.push({ id: newId(), user_id: uid, deal_id: deal.id, body: effect.message, read_at: null, created_at: now() });
        }
      }
    }
  });
  void authorId;
}

export function mockSalesRepo(): SalesRepo {
  return {
    async listDeals(f = {}) {
      const { uid, role } = await actor();
      requireAccess(role);
      const q = (f.q ?? "").trim().toLowerCase();
      return visible(loadSales(), uid, role)
        .filter((d) => !f.pipeline || d.pipeline_slug === f.pipeline)
        .filter((d) => !f.stage || d.stage_slug === f.stage)
        .filter((d) => !f.owner || d.owner_id === f.owner)
        .filter((d) => !q || [d.title, d.contact_name, d.city, d.address, d.contact_phone, d.contact_email].join(" ").toLowerCase().includes(q))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    async getDeal(id) {
      const { uid, role } = await actor();
      requireAccess(role);
      const d = loadSales().deals.find((x) => x.id === id) ?? null;
      if (!d || !canViewDeal({ role, userId: uid, ownerId: d.owner_id })) return null;
      return d;
    },
    async createDeal(input) {
      const { uid, role } = await actor();
      requireAccess(role);
      return mutateSales((db) => {
        const row: SalesDeal = {
          id: newId(),
          pipeline_slug: input.pipeline_slug,
          stage_slug: input.stage_slug,
          title: input.title,
          customer_id: input.customer_id ?? null,
          owner_id: input.owner_id ?? (canSeeAllDeals(role) ? uid : uid),
          contact_name: input.contact_name ?? null,
          contact_phone: input.contact_phone ?? null,
          contact_email: input.contact_email ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          state: input.state ?? "IL",
          zip: input.zip ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          priority: input.priority ?? "Medium",
          source: input.source ?? "manual",
          assessment_date: input.assessment_date ?? null,
          assessment_starts_at: input.assessment_starts_at ?? null,
          assessment_ends_at: input.assessment_ends_at ?? null,
          scheduled_date: input.scheduled_date ?? null,
          close_date: input.close_date ?? null,
          opened_at: now(),
          value: input.value ?? 0,
          est_rebate: input.est_rebate ?? 0,
          converted_project_id: null,
          monday_item_id: input.monday_item_id ?? null,
          monday_board_id: input.monday_board_id ?? null,
          notes: input.notes ?? null,
          created_at: now(),
          updated_at: now(),
        };
        db.deals.push(row);
        return row;
      });
    },
    async updateDeal(id, patch) {
      const { uid, role } = await actor();
      requireAccess(role);
      const prev = loadSales().deals.find((d) => d.id === id);
      if (!prev || !canViewDeal({ role, userId: uid, ownerId: prev.owner_id })) throw new Error("Deal not found");
      const next = mutateSales((db) => {
        const d = db.deals.find((x) => x.id === id)!;
        Object.assign(d, patch, { updated_at: now() });
        return d;
      });
      if (patch.stage_slug && patch.stage_slug !== prev.stage_slug) await fireStageAutomations(next, uid);
      return next;
    },
    async deleteDeal(id) {
      const { uid, role, can_delete } = await actor();
      if (!canDeleteSalesRecord({ role, can_delete })) throw new Error("permission denied");
      const prev = loadSales().deals.find((d) => d.id === id);
      if (!prev || !canViewDeal({ role, userId: uid, ownerId: prev.owner_id })) throw new Error("Deal not found");
      mutateSales((db) => {
        db.deals = db.deals.filter((d) => d.id !== id);
        db.activities = db.activities.filter((a) => a.deal_id !== id);
        db.proposals = db.proposals.filter((p) => p.deal_id !== id);
        db.alerts = db.alerts.filter((a) => a.deal_id !== id);
      });
    },
    async moveStage(id, stage) {
      return this.updateDeal(id, { stage_slug: stage });
    },
    async listInbox() {
      const { role } = await actor();
      requireAccess(role);
      return loadSales().inbox.filter((i) => i.status === "pending").sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async ingestLead(input) {
      if (!input.name?.trim()) throw new Error("name is required");
      return mutateSales((db) => {
        const row = applyLead(input);
        db.inbox.push(row);
        return row;
      });
    },
    async acceptInbox(id, opts) {
      const { uid, role } = await actor();
      requireAccess(role);
      return mutateSales((db) => {
        const item = db.inbox.find((i) => i.id === id);
        if (!item || item.status !== "pending") throw new Error("Inbox item not found");
        const deal: SalesDeal = {
          id: newId(),
          pipeline_slug: item.pipeline_slug,
          stage_slug: "potential_lead",
          title: item.address || item.name,
          customer_id: null,
          owner_id: opts?.owner_id ?? uid,
          contact_name: item.name,
          contact_phone: item.phone,
          contact_email: item.email,
          address: item.address,
          city: item.city,
          state: item.state,
          zip: item.zip,
          lat: null,
          lng: null,
          priority: "Medium",
          source: item.source,
          assessment_date: null,
          assessment_starts_at: null,
          assessment_ends_at: null,
          scheduled_date: null,
          close_date: null,
          opened_at: now(),
          value: 0,
          est_rebate: 0,
          converted_project_id: null,
          monday_item_id: null,
          monday_board_id: null,
          notes: item.message,
          created_at: now(),
          updated_at: now(),
        };
        db.deals.push(deal);
        item.status = "accepted";
        item.accepted_deal_id = deal.id;
        return deal;
      });
    },
    async dismissInbox(id) {
      const { role } = await actor();
      requireAccess(role);
      mutateSales((db) => {
        const item = db.inbox.find((i) => i.id === id);
        if (item) item.status = "dismissed";
      });
    },
    async listActivities(dealId) {
      const deal = await this.getDeal(dealId);
      if (!deal) return [];
      return loadSales().activities.filter((a) => a.deal_id === dealId).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async addActivity(input) {
      const { uid, role } = await actor();
      requireAccess(role);
      return mutateSales((db) => {
        const row: SalesActivity = { ...input, id: newId(), author_id: input.author_id ?? uid, created_at: now(), sent_at: input.sent_at ?? null };
        db.activities.push(row);
        return row;
      });
    },
    async sendDraft(activityId) {
      const { uid, role, name } = await actor();
      requireAccess(role);
      const act = loadSales().activities.find((a) => a.id === activityId);
      if (!act || act.status !== "draft") throw new Error("Draft not found");
      if (act.kind === "sms") {
        const result = await sendSms({ to: act.to_address ?? "", body: act.body });
        return mutateSales((db) => {
          const a = db.activities.find((x) => x.id === activityId)!;
          if (result.skipped) {
            a.meta = { ...(a.meta ?? {}), skip_reason: result.reason, provider: result.provider };
            // stay draft — SMS is not wired
            return a;
          }
          a.status = "sent";
          a.sent_at = now();
          a.author_id = uid;
          return a;
        });
      }
      if (act.kind === "email") {
        const result = await sendEmail({ to: act.to_address ?? "", subject: act.subject ?? "Message from Retrofit Rebates", text: act.body });
        return mutateSales((db) => {
          const a = db.activities.find((x) => x.id === activityId)!;
          if (result.skipped) {
            a.meta = { ...(a.meta ?? {}), skip_reason: "Email is not configured in this environment." };
            return a;
          }
          a.status = "sent";
          a.sent_at = now();
          a.author_id = uid;
          a.from_address = a.from_address ?? name;
          return a;
        });
      }
      throw new Error("Only email or SMS drafts can be sent");
    },
    async listAutomations() {
      const { role } = await actor();
      requireAccess(role);
      const db = loadSales();
      if (!db.automations.length) {
        mutateSales((d) => { d.automations = DEFAULT_AUTOMATIONS.map((r) => ({ ...r, id: newId() })); });
      }
      return loadSales().automations;
    },
    async upsertAutomation(row) {
      const { role } = await actor();
      requireAccess(role);
      return mutateSales((db) => {
        if (row.id) {
          const existing = db.automations.find((a) => a.id === row.id);
          if (!existing) throw new Error("Automation not found");
          Object.assign(existing, row);
          return existing;
        }
        const created: SalesAutomation = {
          id: newId(),
          name: row.name,
          enabled: row.enabled ?? true,
          pipeline_slug: row.pipeline_slug ?? null,
          trigger: row.trigger,
          stage_slug: row.stage_slug ?? null,
          stuck_after_days: row.stuck_after_days ?? null,
          actions: row.actions ?? [],
          auto_send_customer: row.auto_send_customer ?? false,
        };
        db.automations.push(created);
        return created;
      });
    },
    async runStuckScan(clock = new Date()) {
      const { role } = await actor();
      requireAccess(role);
      const db = loadSales();
      let n = 0;
      mutateSales((store) => {
        for (const deal of store.deals) {
          const match = matchingAutomations(store.automations, deal, { type: "stuck_scan", now: clock });
          for (const rule of match) {
            for (const effect of effectsFor(rule, deal)) {
              if (effect.kind === "alert" && deal.owner_id) {
                const already = store.alerts.some((a) => a.deal_id === deal.id && a.body === effect.message && !a.read_at);
                if (already) continue;
                store.alerts.push({ id: newId(), user_id: deal.owner_id, deal_id: deal.id, body: effect.message, read_at: null, created_at: now() });
                n += 1;
              }
            }
          }
        }
      });
      return n;
    },
    async listAlerts() {
      const { uid, role } = await actor();
      requireAccess(role);
      return loadSales().alerts.filter((a) => a.user_id === uid || canSeeAllDeals(role)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async markAlertRead(id) {
      const { uid } = await actor();
      mutateSales((db) => { const a = db.alerts.find((x) => x.id === id && x.user_id === uid); if (a) a.read_at = now(); });
    },
    async listProposals(dealId) {
      if (!(await this.getDeal(dealId))) return [];
      return loadSales().proposals.filter((p) => p.deal_id === dealId);
    },
    async upsertProposal(input) {
      const { role } = await actor();
      requireAccess(role);
      return mutateSales((db) => {
        const items = input.items.map((it, i) => ({ id: newId(), label: it.label, amount: it.amount, sort: i }));
        const net = items.reduce((s, i) => s + i.amount, 0);
        if (input.id) {
          const p = db.proposals.find((x) => x.id === input.id);
          if (!p) throw new Error("Proposal not found");
          Object.assign(p, { title: input.title, notes: input.notes ?? null, items, net, updated_at: now() });
          return p;
        }
        const created: SalesProposal = {
          id: newId(), deal_id: input.deal_id, title: input.title, status: "draft", notes: input.notes ?? null,
          items, net, sent_at: null, signed_at: null, signer_name: null, signer_consent: false,
          signer_method: null, public_token: bookingToken(), created_at: now(), updated_at: now(),
        };
        db.proposals.push(created);
        return created;
      });
    },
    async sendProposal(id) {
      const { role } = await actor();
      requireAccess(role);
      return mutateSales((db) => {
        const p = db.proposals.find((x) => x.id === id);
        if (!p) throw new Error("Proposal not found");
        if (!p.public_token) p.public_token = bookingToken();
        p.status = "sent";
        p.sent_at = now();
        p.updated_at = now();
        return p;
      });
    },
    async getProposalByToken(token) {
      const p = loadSales().proposals.find((x) => x.public_token === token) ?? null;
      if (!p) return null;
      const deal = loadSales().deals.find((d) => d.id === p.deal_id);
      return { ...p, deal_title: deal?.title ?? p.title };
    },
    async signProposalByToken(token, input) {
      const p = loadSales().proposals.find((x) => x.public_token === token);
      if (!p) throw new Error("Proposal not found");
      const deal = loadSales().deals.find((d) => d.id === p.deal_id);
      const result = signProposal({ proposal: p, dealStage: deal?.stage_slug ?? "", signerName: input.signerName, consent: input.consent, method: input.method });
      if (!result.ok) throw new Error(result.error);
      return mutateSales((db) => {
        const row = db.proposals.find((x) => x.id === p.id)!;
        row.status = "signed";
        row.signed_at = result.signedAt;
        row.signer_name = input.signerName.trim();
        row.signer_consent = true;
        row.signer_method = input.method;
        row.updated_at = now();
        if (result.nextStage) {
          const d = db.deals.find((x) => x.id === p.deal_id);
          if (d) { d.stage_slug = result.nextStage; d.updated_at = now(); }
        }
        return row;
      });
    },
    async convertDeal(id, visit) {
      const { uid, role } = await actor();
      requireAccess(role);
      const deal = await this.getDeal(id);
      if (!deal) throw new Error("Deal not found");
      let working = deal;
      if (!working.customer_id) {
        const { mockEnsureCustomerFromDeal } = await import("@/lib/data/mock-repo");
        const c = mockEnsureCustomerFromDeal({
          name: working.contact_name || working.title,
          phone: working.contact_phone,
          email: working.contact_email,
          address: working.address,
          city: working.city,
          state: working.state,
          zip: working.zip,
        });
        working = await this.updateDeal(id, { customer_id: c.id });
      }
      const plan = planConvert({ deal: working, visit: visit ?? null });
      if (!plan.ok) throw new Error(plan.error);
      const { mockCreateConvertedProject } = await import("@/lib/data/mock-repo");
      const { project } = mockCreateConvertedProject(plan.project, plan.visit);
      const next = await this.updateDeal(id, { converted_project_id: project.id, stage_slug: plan.nextStage, scheduled_date: visit ? visit.starts_at.slice(0, 10) : working.scheduled_date });
      void uid;
      return { projectId: project.id, deal: next };
    },
    async createBookingLink(dealId) {
      const deal = await this.getDeal(dealId);
      if (!deal) throw new Error("Deal not found");
      const token = bookingToken();
      mutateSales((db) => {
        const d = db.deals.find((x) => x.id === dealId)!;
        (d as SalesDeal & { booking_token?: string }).booking_token = token;
      });
      return token;
    },
    async getDealByBookingToken(token) {
      return loadSales().deals.find((d) => (d as SalesDeal & { booking_token?: string }).booking_token === token) ?? (token === "demo-book-nora" ? loadSales().deals.find((d) => d.id === "sd-nora") ?? null : null);
    },
    async bookAssessment(token, slot) {
      const deal = await this.getDealByBookingToken(token);
      if (!deal) throw new Error("Booking link is not valid");
      const next = mutateSales((db) => {
        const d = db.deals.find((x) => x.id === deal.id)!;
        d.assessment_date = slot.starts_at.slice(0, 10);
        d.assessment_starts_at = slot.starts_at;
        d.assessment_ends_at = slot.ends_at;
        d.stage_slug = "assessment_scheduled";
        d.updated_at = now();
        return d;
      });
      await fireStageAutomations(next, null);
      return next;
    },
    async listOccupiedWindows(fromIso, toIso) {
      const occupied: { starts_at: string; ends_at: string }[] = [];
      for (const d of loadSales().deals) {
        if (d.assessment_starts_at && d.assessment_ends_at) {
          if (d.assessment_starts_at < toIso && d.assessment_ends_at > fromIso) occupied.push({ starts_at: d.assessment_starts_at, ends_at: d.assessment_ends_at });
        }
      }
      try {
        const { mockOccupiedJobWindows } = await import("@/lib/data/mock-repo");
        occupied.push(...mockOccupiedJobWindows(fromIso, toIso));
      } catch { /* schedule not available */ }
      return occupied;
    },
    async importDeals(deals: ImportedDeal[]) {
      const { uid, role } = await actor();
      if (role && !canAccessSales(role)) throw new Error("permission denied");
      let imported = 0, skipped = 0;
      mutateSales((db) => {
        for (const row of deals) {
          if (db.deals.some((d) => d.monday_item_id === row.monday_item_id && d.monday_board_id === row.monday_board_id)) { skipped += 1; continue; }
          db.deals.push({
            id: newId(),
            pipeline_slug: row.pipeline_slug,
            stage_slug: row.stage_slug,
            title: row.title,
            customer_id: null,
            owner_id: null,
            contact_name: row.contact_name,
            contact_phone: row.contact_phone,
            contact_email: null,
            address: row.address,
            city: row.city,
            state: row.state,
            zip: row.zip,
            lat: null,
            lng: null,
            priority: row.priority,
            source: "monday",
            assessment_date: row.assessment_date,
            assessment_starts_at: null,
            assessment_ends_at: null,
            scheduled_date: row.scheduled_date,
            close_date: row.close_date,
            opened_at: row.opened_at ? `${row.opened_at}T12:00:00.000Z` : now(),
            value: 0,
            est_rebate: 0,
            converted_project_id: null,
            monday_item_id: row.monday_item_id,
            monday_board_id: row.monday_board_id,
            notes: row.owner_name ? `Monday owner: ${row.owner_name}` : null,
            created_at: now(),
            updated_at: now(),
          });
          imported += 1;
        }
      });
      void uid;
      return { imported, skipped };
    },
    async ownerNames() {
      const names: Record<string, string> = { "u-sales": "Maya Chen", "u-sales2": "Jordan Hale", "u-admin": "Luke Dlugosz", "u-manager": "Maria Santos" };
      try {
        const { mockProfiles } = await import("@/lib/data/mock-repo");
        for (const p of mockProfiles()) names[p.id] = p.full_name;
      } catch { /* keep defaults */ }
      return names;
    },
  };
}

/** Public ingest (web form / webhook) does not need a signed-in actor. */
export function ingestLeadPublic(input: LeadInput) {
  return mutateSales((db) => {
    const row = applyLead(input);
    db.inbox.push(row);
    return row;
  });
}

export { openSlots, visibleCustomerIds };
