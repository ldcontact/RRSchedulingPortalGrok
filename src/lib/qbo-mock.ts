/**
 * Design-only QuickBooks Online invoicing mock.
 * Fake sample data for DEV MOCK MODE screens. No Intuit app, no API keys,
 * no network calls, and no invoices are created or emailed.
 */
import { addDays, fmtDateTime, todayKey, zonedToUtc } from "@/lib/time";
import { formatServicePrice } from "@/lib/service-request-price";

export type QboInvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type QboInvoice = {
  number: number;
  amount: number;
  status: QboInvoiceStatus;
  lastSyncedAt: string;
};

export type QboCustomer = {
  id: string;
  name: string;
  email: string;
  address: string;
};

export const QBO_INVOICE_STATUS_LABEL: Record<QboInvoiceStatus, string> = {
  draft: "Draft in QuickBooks",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

export const QBO_INVOICE_STATUS_TONE: Record<QboInvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-sky-100 text-sky-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-50 text-red-700",
};

export const QBO_LIST_CHIP: Record<QboInvoiceStatus, (n: number) => string> = {
  draft: (n) => `Draft #${n}`,
  sent: (n) => `Sent #${n}`,
  paid: () => "Paid",
  overdue: (n) => `Overdue #${n}`,
};

export const MOCK_QBO_COMPANY = "Retrofit Rebates, Inc.";
export const MOCK_QBO_CONNECTED_BY = "Luke Dlugosz";
export const MOCK_QBO_ITEM = "Service call";
export const MOCK_QBO_TERMS = "Net 30";
export const MOCK_QBO_TAX = "Non-taxable";
export const MOCK_NEXT_INVOICE_NUMBER = 1047;

/** Last sync: today at 4:52 PM Central, for stable mock copy. */
export function mockQboLastSyncIso() {
  return zonedToUtc(todayKey(), 16 * 60 + 52);
}

export function formatQboSync(iso: string) {
  return `${fmtDateTime(iso)} CT`;
}

export const MOCK_QBO_CUSTOMERS: QboCustomer[] = [
  { id: "qbo-c2", name: "Golf Road Auto Body", email: "tony@golfrdautobody.example", address: "905 E Golf Rd, Schaumburg, IL 60173" },
  { id: "qbo-c2b", name: "Golf Rd Auto Body, Inc.", email: "accounts@golfrdautobody.example", address: "905 E Golf Road, Schaumburg, IL 60173" },
  { id: "qbo-c1", name: "Lakeview Family Dental", email: "office@lakeviewdental.example", address: "1420 W Algonquin Rd, Arlington Heights, IL 60005" },
  { id: "qbo-c4", name: "Elk Grove Precision Machining", email: "dkowalski@egprecision.example", address: "2250 Lunt Ave, Elk Grove Village, IL 60007" },
  { id: "qbo-c3", name: "Prairie Bean Coffee Co.", email: "megan@prairiebean.example", address: "38 N Brockway St, Palatine, IL 60067" },
  { id: "qbo-c5", name: "Hoffman Estates Self Storage", email: "linda@hestorage.example", address: "1600 W Higgins Rd, Hoffman Estates, IL 60169" },
  { id: "qbo-c8", name: "Roselle Family Pharmacy", email: "ken@rosellerx.example", address: "122 E Irving Park Rd, Roselle, IL 60172" },
];

/** Seeded invoices shown on the service requests list and as the default ticket state. */
export const MOCK_INVOICES_BY_SR: Record<string, QboInvoice> = {
  sr2: { number: 1047, amount: 285, status: "draft", lastSyncedAt: mockQboLastSyncIso() },
  sr5: { number: 1041, amount: 185, status: "paid", lastSyncedAt: zonedToUtc(addDays(todayKey(), -12), 11 * 60 + 10) },
};

export function invoiceForRequest(requestId: string, override?: string): QboInvoice | null {
  const raw = (override ?? "").trim().toLowerCase();
  if (raw === "none" || raw === "0") return null;
  if (raw === "draft" || raw === "sent" || raw === "paid" || raw === "overdue") {
    const seed = MOCK_INVOICES_BY_SR[requestId];
    return {
      number: seed?.number ?? MOCK_NEXT_INVOICE_NUMBER,
      amount: seed?.amount ?? 285,
      status: raw,
      lastSyncedAt: mockQboLastSyncIso(),
    };
  }
  return MOCK_INVOICES_BY_SR[requestId] ?? null;
}

export function matchQboCustomer(name: string | null | undefined): QboCustomer | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  return MOCK_QBO_CUSTOMERS.find((c) => c.name.toLowerCase() === n) ?? null;
}

export function searchQboCustomers(q: string): QboCustomer[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return MOCK_QBO_CUSTOMERS;
  return MOCK_QBO_CUSTOMERS.filter((c) =>
    `${c.name} ${c.email} ${c.address}`.toLowerCase().includes(needle),
  );
}

export function defaultDueDate() {
  return addDays(todayKey(), 30);
}

export function money(amount: number) {
  return formatServicePrice(amount);
}

export function invoiceHref(base: string, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams(extra);
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}
