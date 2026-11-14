/**
 * DEV MOCK MODE ONLY: an in-process stand-in for Intuit's OAuth and QuickBooks
 * Accounting API so the screens can be exercised locally with no Intuit account.
 * Never used when real QBO_CLIENT_ID is set or outside mock mode.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INTUIT_REVOKE_URL, INTUIT_TOKEN_URL } from "./config";

type Addr = { Line1?: string; Line2?: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string; Country?: string };
type Cust = {
  Id: string; SyncToken: string; DisplayName: string; Active: boolean;
  CompanyName?: string; GivenName?: string; FamilyName?: string; Notes?: string;
  PrimaryEmailAddr?: { Address: string }; PrimaryPhone?: { FreeFormNumber?: string }; Mobile?: { FreeFormNumber?: string };
  BillAddr?: Addr; ShipAddr?: Addr;
};
type Inv = {
  Id: string; SyncToken: string; DocNumber: string; TxnDate: string; DueDate: string;
  TotalAmt: number; Balance: number; EmailStatus: string; CustomerRef: { value: string };
  PrivateNote?: string; CustomerMemo?: { value?: string }; BillEmail?: { Address?: string }; ShipAddr?: Addr; Line: unknown[];
};
type FakeDb = { nextId: number; nextDoc: number; customers: Cust[]; invoices: Inv[] };

export const FAKE_REALM_ID = "9341455000000000";
export const FAKE_COMPANY = "Retrofit Rebates, Inc. (sandbox)";
const FILE = join(process.cwd(), ".mock-qbo-intuit.json");

const addr = (Line1: string, City: string, PostalCode: string) => ({ Line1, City, CountrySubDivisionCode: "IL", PostalCode });
function seed(): FakeDb {
  const c = (Id: string, DisplayName: string, email: string, a: ReturnType<typeof addr>): Cust => ({ Id, SyncToken: "0", DisplayName, Active: true, PrimaryEmailAddr: { Address: email }, BillAddr: a });
  return {
    nextId: 200, nextDoc: 1047, invoices: [],
    customers: [
      c("58", "Golf Road Auto Body", "tony@golfrdautobody.example", addr("905 E Golf Rd", "Schaumburg", "60173")),
      c("59", "Golf Rd Auto Body, Inc.", "accounts@golfrdautobody.example", addr("905 E Golf Road", "Schaumburg", "60173")),
      c("60", "Lakeview Family Dental", "office@lakeviewdental.example", addr("1420 W Algonquin Rd", "Arlington Heights", "60005")),
      c("61", "Elk Grove Precision Machining", "dkowalski@egprecision.example", addr("2250 Lunt Ave", "Elk Grove Village", "60007")),
      c("62", "Prairie Bean Coffee Co.", "megan@prairiebean.example", addr("38 N Brockway St", "Palatine", "60067")),
      // Roselle Family Pharmacy is intentionally missing so the "No match — create customer" path can be exercised.
      c("63", "Hoffman Estates Self Storage", "linda@hestorage.example", addr("1600 W Higgins Rd", "Hoffman Estates", "60169")),
    ],
  };
}
function load(): FakeDb { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) as FakeDb : seed(); }
function save(db: FakeDb) { writeFileSync(FILE, JSON.stringify(db, null, 2)); }

const ITEMS = [
  { Id: "1", Name: "Service call", Type: "Service", Active: true },
  { Id: "2", Name: "Labor", Type: "Service", Active: true },
  { Id: "3", Name: "Materials", Type: "NonInventory", Active: true },
];
const TERMS = [
  { Id: "1", Name: "Due on receipt", DueDays: 0, Active: true },
  { Id: "2", Name: "Net 15", DueDays: 15, Active: true },
  { Id: "3", Name: "Net 30", DueDays: 30, Active: true },
  { Id: "4", Name: "Net 60", DueDays: 60, Active: true },
];
const TAXCODES = [{ Id: "5", Name: "Illinois sales tax", Taxable: true, Active: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "7" } }] } }];
const TAXRATES = [{ Id: "7", Name: "IL combined", RateValue: 10.25, Active: true }];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fault = (status: number, code: string, Message: string, Detail = "") => json(status, { Fault: { Error: [{ Message, Detail, code }], type: "ValidationFault" } });

function where(sql: string) {
  const m = /\bwhere\b(.*?)(\borderby\b|\bmaxresults\b|$)/i.exec(sql);
  const conds: { field: string; op: string; value: string }[] = [];
  for (const c of (m?.[1] ?? "").matchAll(/(\w+)\s*(=|like)\s*('(?:\\'|[^'])*'|true|false)/gi)) {
    conds.push({ field: c[1], op: c[2].toLowerCase(), value: c[3].replace(/^'|'$/g, "").replace(/\\'/g, "'") });
  }
  return conds;
}
function matches(row: Record<string, unknown>, conds: ReturnType<typeof where>) {
  return conds.every(({ field, op, value }) => {
    let v: unknown = row[field];
    if (field === "PrimaryEmailAddr") v = (row.PrimaryEmailAddr as { Address?: string } | undefined)?.Address;
    if (value === "true" || value === "false") return String(v ?? true) === value;
    const s = String(v ?? "");
    if (op === "like") return s.toLowerCase().includes(value.replace(/%/g, "").toLowerCase());
    return s.toLowerCase() === value.toLowerCase();
  });
}

/** fetch() replacement used in mock mode. */
export async function fakeIntuitFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, "http://localhost");
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  if (input === INTUIT_TOKEN_URL) {
    const p = new URLSearchParams(body);
    if (p.get("grant_type") === "authorization_code" && p.get("code") !== "fake-code") return json(400, { error: "invalid_grant" });
    const n = Date.now();
    return json(200, { access_token: `fake-access-${n}`, refresh_token: `fake-refresh-${n}`, expires_in: 3600, x_refresh_token_expires_in: 8726400, token_type: "bearer" });
  }
  if (input === INTUIT_REVOKE_URL) return new Response(null, { status: 200 });
  const m = /\/v3\/company\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (!m) return json(404, {});
  const path = m[2];
  const db = load();
  if (path.startsWith("companyinfo/")) return json(200, { CompanyInfo: { CompanyName: FAKE_COMPANY } });
  if (path === "query") {
    const sql = url.searchParams.get("query") ?? "";
    const entity = /from\s+(\w+)/i.exec(sql)?.[1] ?? "";
    const conds = where(sql);
    const tables: Record<string, Record<string, unknown>[]> = {
      Customer: db.customers, Item: ITEMS, Term: TERMS, TaxCode: TAXCODES, TaxRate: TAXRATES,
      Account: [{ Id: "1", Name: "Services", AccountType: "Income", Active: true }],
    };
    const rows = (tables[entity] ?? []).filter((r) => matches(r, conds));
    return json(200, { QueryResponse: rows.length ? { [entity]: rows } : {} });
  }
  if (path.startsWith("customer/")) {
    const c = db.customers.find((x) => x.Id === path.split("/")[1]);
    return c ? json(200, { Customer: c }) : fault(400, "610", "Object Not Found");
  }
  if (path === "customer" && method === "POST") {
    const b = JSON.parse(body) as Cust & { sparse?: boolean };
    if (b.Id) {
      const c = db.customers.find((x) => x.Id === b.Id);
      if (!c) return fault(400, "610", "Object Not Found");
      if (String(c.SyncToken) !== String(b.SyncToken)) return fault(400, "5010", "Stale Object Error");
      const { Id: _id, SyncToken: _tok, sparse: _sp, ...rest } = b as Cust & { sparse?: boolean };
      Object.assign(c, rest, { SyncToken: String(Number(c.SyncToken) + 1) });
      save(db);
      return json(200, { Customer: c });
    }
    if (db.customers.some((c) => c.DisplayName.toLowerCase() === (b.DisplayName ?? "").toLowerCase())) return fault(400, "6240", "Duplicate Name Exists Error");
    const c = { ...b, Id: String(db.nextId++), SyncToken: "0", Active: true };
    db.customers.push(c); save(db);
    return json(200, { Customer: c });
  }
  if (path === "item" && method === "POST") return json(200, { Item: { Id: "1", Name: "Service call" } });
  if (/^invoice\/[^/]+\/send$/.test(path) && method === "POST") {
    const inv = db.invoices.find((x) => x.Id === path.split("/")[1]);
    if (!inv) return fault(400, "610", "Object Not Found");
    const sendTo = (url.searchParams.get("sendTo") ?? "").trim();
    if (!sendTo || !sendTo.includes("@")) return fault(400, "2010", "A valid sendTo email is required");
    inv.EmailStatus = "EmailSent";
    inv.BillEmail = { Address: sendTo };
    inv.SyncToken = String(Number(inv.SyncToken) + 1);
    save(db);
    return json(200, { Invoice: inv });
  }
  if (path.startsWith("invoice/")) {
    const inv = db.invoices.find((x) => x.Id === path.split("/")[1]);
    return inv ? json(200, { Invoice: inv }) : fault(400, "610", "Object Not Found");
  }
  if (path === "invoice" && method === "POST") {
    const b = JSON.parse(body) as Record<string, unknown> & { Id?: string; SyncToken?: string };
    if (url.searchParams.get("operation") === "void") {
      const inv = db.invoices.find((x) => x.Id === b.Id);
      if (!inv) return fault(400, "610", "Object Not Found");
      if (inv.SyncToken !== b.SyncToken) return fault(400, "5010", "Stale Object Error");
      Object.assign(inv, { TotalAmt: 0, Balance: 0, SyncToken: String(Number(inv.SyncToken) + 1), PrivateNote: `Voided ${inv.PrivateNote ?? ""}`.trim() });
      save(db);
      return json(200, { Invoice: inv });
    }
    if (b.EmailStatus && b.EmailStatus !== "NotSet") return fault(400, "2010", "Fake Intuit refuses emailed invoices");
    const lines = (b.Line as { Amount: number; SalesItemLineDetail?: { TaxCodeRef?: { value: string } } }[]) ?? [];
    const sub = lines.reduce((s, l) => s + Number(l.Amount), 0);
    const taxed = (b.TxnTaxDetail as { TxnTaxCodeRef?: { value: string } } | undefined)?.TxnTaxCodeRef?.value === "5";
    const total = Math.round((sub + (taxed ? sub * 0.1025 : 0)) * 100) / 100;
    const inv: Inv = {
      Id: String(db.nextId++), SyncToken: "0", DocNumber: String(db.nextDoc++), TxnDate: String(b.TxnDate), DueDate: String(b.DueDate),
      TotalAmt: total, Balance: total, EmailStatus: "NotSet", CustomerRef: b.CustomerRef as { value: string },
      PrivateNote: b.PrivateNote as string | undefined,
      CustomerMemo: b.CustomerMemo as { value?: string } | undefined,
      BillEmail: b.BillEmail as { Address?: string } | undefined,
      ShipAddr: b.ShipAddr as Addr | undefined,
      Line: lines,
    };
    db.invoices.push(inv); save(db);
    return json(200, { Invoice: inv });
  }
  return json(404, {});
}
