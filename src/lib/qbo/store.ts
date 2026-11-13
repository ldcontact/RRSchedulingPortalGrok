import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MOCK_MODE } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QboEnvironment } from "./config";

/*
 * Server-only persistence for the QuickBooks integration. The Supabase tables have RLS
 * enabled with NO client policies, so only this service-role code can read them, and
 * only after the caller passed an admin/manager check. Tokens are stored encrypted.
 */
export type QboConnectionRow = {
  realm_id: string;
  environment: QboEnvironment;
  company_name: string;
  access_token_enc: string;
  refresh_token_enc: string;
  access_expires_at: string;
  refresh_expires_at: string;
  connected_by: string | null;
  connected_by_name: string | null;
  connected_at: string;
  last_sync_at: string | null;
  default_item_id: string | null;
  default_item_name: string | null;
  default_term_id: string | null;
  default_term_name: string | null;
  default_tax_code_id: string | null;
  default_tax_code_name: string | null;
};

export type QboCustomerLinkRow = {
  customer_id: string;
  realm_id: string;
  qbo_customer_id: string;
  qbo_display_name: string;
  linked_by: string | null;
  linked_at: string;
};

export type ServiceRequestInvoiceRow = {
  id: string;
  service_request_id: string;
  realm_id: string;
  environment: QboEnvironment;
  qbo_invoice_id: string;
  doc_number: string | null;
  total: number;
  balance: number;
  email_status: string | null;
  due_date: string | null;
  txn_date: string | null;
  status: string;
  voided_at: string | null;
  voided_by: string | null;
  created_by: string | null;
  created_at: string;
  synced_at: string;
};

export interface QboStore {
  getConnection(): Promise<QboConnectionRow | null>;
  saveConnection(row: QboConnectionRow): Promise<void>;
  updateConnection(patch: Partial<QboConnectionRow>): Promise<void>;
  deleteConnection(): Promise<void>;
  getCustomerLink(customerId: string, realmId: string): Promise<QboCustomerLinkRow | null>;
  setCustomerLink(row: QboCustomerLinkRow): Promise<void>;
  getActiveInvoice(serviceRequestId: string): Promise<ServiceRequestInvoiceRow | null>;
  listActiveInvoices(serviceRequestIds: string[]): Promise<Record<string, ServiceRequestInvoiceRow>>;
  insertInvoice(row: Omit<ServiceRequestInvoiceRow, "id" | "created_at">): Promise<ServiceRequestInvoiceRow>;
  updateInvoice(id: string, patch: Partial<ServiceRequestInvoiceRow>): Promise<void>;
}

// ---------------------------------------------------------------- Supabase (service role)
function supabaseStore(): QboStore {
  const admin = createAdminClient();
  if (!admin) throw new Error("QuickBooks needs SUPABASE_SERVICE_ROLE_KEY on the server.");
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  return {
    async getConnection() {
      const { data, error } = await admin.from("qbo_connections").select("*").eq("id", true).maybeSingle();
      fail(error);
      return (data as QboConnectionRow | null) ?? null;
    },
    async saveConnection(row) {
      const { error } = await admin.from("qbo_connections").upsert({ id: true, ...row }, { onConflict: "id" });
      fail(error);
    },
    async updateConnection(patch) {
      const { error } = await admin.from("qbo_connections").update(patch).eq("id", true);
      fail(error);
    },
    async deleteConnection() {
      const { error } = await admin.from("qbo_connections").delete().eq("id", true);
      fail(error);
    },
    async getCustomerLink(customerId, realmId) {
      const { data, error } = await admin.from("qbo_customer_links").select("*").eq("customer_id", customerId).eq("realm_id", realmId).maybeSingle();
      fail(error);
      return (data as QboCustomerLinkRow | null) ?? null;
    },
    async setCustomerLink(row) {
      const { error } = await admin.from("qbo_customer_links").upsert(row, { onConflict: "customer_id,realm_id" });
      fail(error);
    },
    async getActiveInvoice(srId) {
      const { data, error } = await admin.from("service_request_invoices").select("*").eq("service_request_id", srId).is("voided_at", null).maybeSingle();
      fail(error);
      return (data as ServiceRequestInvoiceRow | null) ?? null;
    },
    async listActiveInvoices(ids) {
      if (!ids.length) return {};
      const { data, error } = await admin.from("service_request_invoices").select("*").in("service_request_id", ids).is("voided_at", null);
      fail(error);
      return Object.fromEntries(((data ?? []) as ServiceRequestInvoiceRow[]).map((r) => [r.service_request_id, r]));
    },
    async insertInvoice(row) {
      const { data, error } = await admin.from("service_request_invoices").insert(row).select("*").single();
      fail(error);
      return data as ServiceRequestInvoiceRow;
    },
    async updateInvoice(id, patch) {
      const { error } = await admin.from("service_request_invoices").update(patch).eq("id", id);
      fail(error);
    },
  };
}

// ---------------------------------------------------------------- DEV MOCK MODE (local JSON file)
type MockDb = { connection: QboConnectionRow | null; links: QboCustomerLinkRow[]; invoices: ServiceRequestInvoiceRow[] };
const MOCK_FILE = join(process.cwd(), ".mock-qbo.json");
function loadMock(): MockDb {
  if (!existsSync(MOCK_FILE)) return { connection: null, links: [], invoices: [] };
  return JSON.parse(readFileSync(MOCK_FILE, "utf8")) as MockDb;
}
function mutateMock<T>(fn: (db: MockDb) => T): T {
  const db = loadMock();
  const out = fn(db);
  writeFileSync(MOCK_FILE, JSON.stringify(db, null, 2));
  return out;
}

function mockStore(): QboStore {
  return {
    async getConnection() { return loadMock().connection; },
    async saveConnection(row) { mutateMock((db) => { db.connection = row; }); },
    async updateConnection(patch) { mutateMock((db) => { if (db.connection) db.connection = { ...db.connection, ...patch }; }); },
    async deleteConnection() { mutateMock((db) => { db.connection = null; }); },
    async getCustomerLink(customerId, realmId) { return loadMock().links.find((l) => l.customer_id === customerId && l.realm_id === realmId) ?? null; },
    async setCustomerLink(row) {
      mutateMock((db) => { db.links = [...db.links.filter((l) => !(l.customer_id === row.customer_id && l.realm_id === row.realm_id)), row]; });
    },
    async getActiveInvoice(srId) { return loadMock().invoices.find((i) => i.service_request_id === srId && !i.voided_at) ?? null; },
    async listActiveInvoices(ids) {
      const set = new Set(ids);
      return Object.fromEntries(loadMock().invoices.filter((i) => set.has(i.service_request_id) && !i.voided_at).map((i) => [i.service_request_id, i]));
    },
    async insertInvoice(row) {
      return mutateMock((db) => {
        if (db.invoices.some((i) => i.service_request_id === row.service_request_id && !i.voided_at)) throw new Error("This ticket already has an invoice.");
        const full = { ...row, id: randomUUID(), created_at: new Date().toISOString() };
        db.invoices.push(full);
        return full;
      });
    },
    async updateInvoice(id, patch) { mutateMock((db) => { db.invoices = db.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)); }); },
  };
}

export function getQboStore(): QboStore {
  return MOCK_MODE ? mockStore() : supabaseStore();
}
