import type { LeadSource, PipelineSlug, SalesPriority } from "./catalog";

export type SalesActivityKind = "note" | "sms" | "email" | "call" | "system" | "automation";
export type SalesActivityDirection = "inbound" | "outbound" | "internal";
export type SalesActivityStatus = "draft" | "queued" | "sent" | "received" | "failed" | "logged";

export type SalesInboxStatus = "pending" | "accepted" | "dismissed";

export type SalesDeal = {
  id: string;
  pipeline_slug: PipelineSlug | string;
  stage_slug: string;
  title: string;
  customer_id: string | null;
  owner_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  priority: SalesPriority;
  source: LeadSource;
  assessment_date: string | null;
  assessment_starts_at: string | null;
  assessment_ends_at: string | null;
  scheduled_date: string | null;
  close_date: string | null;
  opened_at: string;
  value: number;
  est_rebate: number;
  converted_project_id: string | null;
  monday_item_id: string | null;
  monday_board_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesInboxItem = {
  id: string;
  source: LeadSource;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  pipeline_slug: string;
  message: string | null;
  raw: Record<string, unknown> | null;
  status: SalesInboxStatus;
  accepted_deal_id: string | null;
  created_at: string;
};

export type SalesActivity = {
  id: string;
  deal_id: string | null;
  inbox_id: string | null;
  kind: SalesActivityKind;
  direction: SalesActivityDirection;
  status: SalesActivityStatus;
  subject: string | null;
  body: string;
  to_address: string | null;
  from_address: string | null;
  author_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
};

export type SalesAutomationTrigger = "stage_entered" | "stuck_in_stage";
export type SalesAutomationAction =
  | { type: "in_app_alert"; message?: string }
  | { type: "email_owner"; message?: string }
  | { type: "draft_sms"; body: string }
  | { type: "draft_email"; subject: string; body: string }
  | { type: "create_task"; title: string }
  | { type: "notify_role"; role: "admin" | "manager" };

export type SalesAutomation = {
  id: string;
  name: string;
  enabled: boolean;
  pipeline_slug: string | null; // null = all
  trigger: SalesAutomationTrigger;
  stage_slug: string | null;
  stuck_after_days: number | null;
  actions: SalesAutomationAction[];
  /** Customer-facing sends are always drafts unless this is true AND a later policy allows auto-send. Default false. */
  auto_send_customer: boolean;
};

export type SalesProposalStatus = "draft" | "sent" | "signed" | "void";
export type SalesProposalItem = { id: string; label: string; amount: number; sort: number };
export type SalesProposal = {
  id: string;
  deal_id: string;
  title: string;
  status: SalesProposalStatus;
  notes: string | null;
  items: SalesProposalItem[];
  net: number;
  sent_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_consent: boolean;
  signer_method?: "typed" | "drawn" | null;
  public_token?: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesBookingSlot = { starts_at: string; ends_at: string };

/** Linked operations records loaded through sales_* SECURITY DEFINER RPCs, not table SELECT policies. */
export type SalesLinkedCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};
export type SalesLinkedProject = {
  id: string;
  name: string;
  type: string;
  status: string;
  value: number;
  est_rebate: number;
};
export type SalesLinkedJob = {
  id: string;
  project_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
};


export function dealLengthDays(deal: Pick<SalesDeal, "opened_at" | "close_date">, now = new Date()): number {
  const end = deal.close_date ? new Date(deal.close_date + (deal.close_date.length <= 10 ? "T23:59:59" : "")) : now;
  const start = new Date(deal.opened_at);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 864e5));
}

export type SalesAlert = {
  id: string;
  user_id: string;
  deal_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};
