import { MOCK_MODE } from "@/lib/env";
import type { LeadSource } from "./catalog";
import type { SalesActivity, SalesAlert, SalesAutomation, SalesDeal, SalesInboxItem, SalesProposal } from "./types";
import type { ImportedDeal } from "./import-monday";

export type DealFilter = { pipeline?: string; stage?: string; owner?: string; q?: string };

export type LeadInput = {
  source: LeadSource;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  pipeline_slug?: string;
  message?: string | null;
  raw?: Record<string, unknown> | null;
};

export type SalesRepo = {
  listDeals(f?: DealFilter): Promise<SalesDeal[]>;
  getDeal(id: string): Promise<SalesDeal | null>;
  createDeal(input: Partial<SalesDeal> & { title: string; pipeline_slug: string; stage_slug: string }): Promise<SalesDeal>;
  updateDeal(id: string, patch: Partial<SalesDeal>): Promise<SalesDeal>;
  deleteDeal(id: string): Promise<void>;
  moveStage(id: string, stage: string): Promise<SalesDeal>;
  listInbox(): Promise<SalesInboxItem[]>;
  ingestLead(input: LeadInput): Promise<SalesInboxItem>;
  acceptInbox(id: string, opts?: { owner_id?: string | null }): Promise<SalesDeal>;
  dismissInbox(id: string): Promise<void>;
  listActivities(dealId: string): Promise<SalesActivity[]>;
  addActivity(input: Omit<SalesActivity, "id" | "created_at" | "sent_at"> & { sent_at?: string | null }): Promise<SalesActivity>;
  sendDraft(activityId: string): Promise<SalesActivity>;
  listAutomations(): Promise<SalesAutomation[]>;
  upsertAutomation(row: Partial<SalesAutomation> & { name: string; trigger: SalesAutomation["trigger"] }): Promise<SalesAutomation>;
  runStuckScan(now?: Date): Promise<number>;
  listAlerts(): Promise<SalesAlert[]>;
  markAlertRead(id: string): Promise<void>;
  listProposals(dealId: string): Promise<SalesProposal[]>;
  upsertProposal(input: { id?: string; deal_id: string; title: string; notes?: string | null; items: { label: string; amount: number }[] }): Promise<SalesProposal>;
  sendProposal(id: string): Promise<SalesProposal>;
  getProposalByToken(token: string): Promise<(SalesProposal & { deal_title: string }) | null>;
  signProposalByToken(token: string, input: { signerName: string; consent: boolean; method: "typed" | "drawn" }): Promise<SalesProposal>;
  convertDeal(id: string, visit?: { starts_at: string; ends_at: string } | null): Promise<{ projectId: string; deal: SalesDeal }>;
  createBookingLink(dealId: string): Promise<string>;
  getDealByBookingToken(token: string): Promise<SalesDeal | null>;
  bookAssessment(token: string, slot: { starts_at: string; ends_at: string }): Promise<SalesDeal>;
  listOccupiedWindows(fromIso: string, toIso: string): Promise<{ starts_at: string; ends_at: string }[]>;
  importDeals(deals: ImportedDeal[], meta?: { source?: string; board_name?: string }): Promise<{ imported: number; skipped: number }>;
  ownerNames(): Promise<Record<string, string>>;
  ownerDirectory(): Promise<Record<string, { name: string; color: string }>>;
};

export async function getSalesRepo(): Promise<SalesRepo> {
  if (MOCK_MODE) return (await import("./mock-repo")).mockSalesRepo();
  return (await import("./supabase-repo")).supabaseSalesRepo();
}
