import { ASSESSMENT_SCHEDULED_SLUG, APPROVED_SLUG } from "./catalog";
import { DEFAULT_SEND_POLICY, resolveCustomerDelivery, type SendPolicy } from "./policy";
import type { SalesActivity, SalesAutomation, SalesDeal } from "./types";
import { dealLengthDays } from "./types";

export const DEFAULT_AUTOMATIONS: Omit<SalesAutomation, "id">[] = [
  {
    name: "When a deal is moved to Assessment Scheduled",
    enabled: true,
    pipeline_slug: null,
    trigger: "stage_entered",
    stage_slug: ASSESSMENT_SCHEDULED_SLUG,
    stuck_after_days: null,
    auto_send_customer: false,
    actions: [
      { type: "draft_sms", body: "You're booked for a home assessment on {{assessment_date}} at {{title}}. Reply if you need to change it." },
      { type: "create_task", title: "Send prep packet for {{title}}" },
    ],
  },
  {
    name: "When a deal sits in a stage for more than 14 days",
    enabled: true,
    pipeline_slug: null,
    trigger: "stuck_in_stage",
    stage_slug: null,
    stuck_after_days: 14,
    auto_send_customer: false,
    actions: [
      { type: "in_app_alert", message: "Stuck in {{stage}} for {{days}} days." },
      { type: "email_owner", message: "{{title}} has been in {{stage}} for {{days}} days." },
    ],
  },
  {
    name: "When a deal is moved to Approved - Ready to Schedule",
    enabled: true,
    pipeline_slug: "single_family_whe",
    trigger: "stage_entered",
    stage_slug: APPROVED_SLUG,
    stuck_after_days: null,
    auto_send_customer: false,
    actions: [
      { type: "notify_role", role: "manager" },
      { type: "draft_sms", body: "Hi {{contact}}, your home is approved to schedule. I'll follow up with a time that works for you." },
    ],
  },
];

const SKIP_STUCK_STAGES = new Set(["declined", "project_completed", "permit_final", "not_feasible"]);

export function interpolate(template: string, deal: SalesDeal, extra: Record<string, string> = {}): string {
  const map: Record<string, string> = {
    title: deal.title,
    contact: deal.contact_name ?? "there",
    assessment_date: deal.assessment_date ?? "the scheduled day",
    stage: deal.stage_slug.replace(/_/g, " "),
    days: String(dealLengthDays(deal)),
    ...extra,
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => map[k] ?? "");
}

export type AutomationEffect =
  | { kind: "activity"; activity: Omit<SalesActivity, "id" | "created_at"> }
  | { kind: "task"; title: string; ownerId: string | null }
  | { kind: "alert"; message: string; ownerId: string | null };

export function matchingAutomations(rules: SalesAutomation[], deal: SalesDeal, event: { type: "stage_entered"; from?: string } | { type: "stuck_scan"; now?: Date }): SalesAutomation[] {
  return rules.filter((r) => {
    if (!r.enabled) return false;
    if (r.pipeline_slug && r.pipeline_slug !== deal.pipeline_slug) return false;
    if (event.type === "stage_entered") {
      return r.trigger === "stage_entered" && (!r.stage_slug || r.stage_slug === deal.stage_slug);
    }
    if (r.trigger !== "stuck_in_stage") return false;
    if (SKIP_STUCK_STAGES.has(deal.stage_slug)) return false;
    const days = r.stuck_after_days ?? 14;
    return dealLengthDays(deal, event.now) >= days;
  });
}

export function effectsFor(rule: SalesAutomation, deal: SalesDeal, policy: SendPolicy = DEFAULT_SEND_POLICY, ready = { sms: false, email: true }): AutomationEffect[] {
  const out: AutomationEffect[] = [];
  for (const action of rule.actions) {
    if (action.type === "draft_sms" || action.type === "draft_email") {
      const kind = action.type === "draft_sms" ? "sms" : "email";
      const delivery = resolveCustomerDelivery(kind, ready, policy, rule.auto_send_customer);
      const body = interpolate(action.type === "draft_sms" ? action.body : action.body, deal);
      out.push({
        kind: "activity",
        activity: {
          deal_id: deal.id,
          inbox_id: null,
          kind,
          direction: "outbound",
          status: delivery.status === "sent" ? "sent" : "draft",
          subject: action.type === "draft_email" ? interpolate(action.subject, deal) : null,
          body,
          to_address: kind === "sms" ? deal.contact_phone : deal.contact_email,
          from_address: null,
          author_id: null,
          meta: { automation: rule.name, reason: delivery.reason ?? null },
          sent_at: delivery.sent ? new Date().toISOString() : null,
        },
      });
    } else if (action.type === "create_task") {
      out.push({ kind: "task", title: interpolate(action.title, deal), ownerId: deal.owner_id });
    } else if (action.type === "in_app_alert" || action.type === "email_owner" || action.type === "notify_role") {
      const message = interpolate(action.type === "in_app_alert" || action.type === "email_owner" ? (action.message ?? "{{title}} needs attention.") : `${deal.title} is {{stage}}.`, deal);
      out.push({ kind: "alert", message, ownerId: deal.owner_id });
      out.push({
        kind: "activity",
        activity: {
          deal_id: deal.id,
          inbox_id: null,
          kind: "automation",
          direction: "internal",
          status: "logged",
          subject: rule.name,
          body: message,
          to_address: null,
          from_address: null,
          author_id: null,
          meta: { automation: rule.name, action: action.type },
          sent_at: null,
        },
      });
    }
  }
  return out;
}
