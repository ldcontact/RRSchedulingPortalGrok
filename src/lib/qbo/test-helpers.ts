/* Test-only helpers: an in-memory QboStore and a scripted Intuit fetch. Not imported by app code. */
import type { QboStore, QboConnectionRow, QboCustomerLinkRow, ServiceRequestInvoiceRow } from "./store";

export function memoryStore(init: { connection?: QboConnectionRow | null } = {}) {
  const db = { connection: init.connection ?? null, links: [] as QboCustomerLinkRow[], invoices: [] as ServiceRequestInvoiceRow[] };
  let n = 0;
  const store: QboStore = {
    async getConnection() { return db.connection; },
    async saveConnection(row) { db.connection = row; },
    async updateConnection(p) { if (db.connection) db.connection = { ...db.connection, ...p }; },
    async deleteConnection() { db.connection = null; },
    async getCustomerLink(c, r) { return db.links.find((l) => l.customer_id === c && l.realm_id === r) ?? null; },
    async setCustomerLink(row) { db.links = [...db.links.filter((l) => !(l.customer_id === row.customer_id && l.realm_id === row.realm_id)), row]; },
    async getActiveInvoice(id) { return db.invoices.find((i) => i.service_request_id === id && !i.voided_at) ?? null; },
    async listActiveInvoices(ids) { return Object.fromEntries(db.invoices.filter((i) => ids.includes(i.service_request_id) && !i.voided_at).map((i) => [i.service_request_id, i])); },
    async insertInvoice(row) { const full = { ...row, id: `inv-${++n}`, created_at: new Date().toISOString() }; db.invoices.push(full); return full; },
    async updateInvoice(id, p) { db.invoices = db.invoices.map((i) => (i.id === id ? { ...i, ...p } : i)); },
  };
  return { store, db };
}

export type Call = { url: URL; method: string; headers: Record<string, string>; body: string };
type Handler = (c: Call) => Response | { status?: number; json?: unknown; headers?: Record<string, string> } | undefined;

/** A fetch mock that records every call and answers from `handler`. */
export function scriptedFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = async (input: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const call: Call = { url: new URL(input), method: (init.method ?? "GET").toUpperCase(), headers, body: typeof init.body === "string" ? init.body : "" };
    calls.push(call);
    const r = handler(call);
    if (r instanceof Response) return r;
    if (!r) return new Response(JSON.stringify({ Fault: { Error: [{ Message: "unexpected", code: "999" }] } }), { status: 400 });
    return new Response(r.json === undefined ? "" : JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  };
  return { fetch: fn, calls };
}

export const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
