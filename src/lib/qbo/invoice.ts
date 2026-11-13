/** Pure invoice-draft validation and QuickBooks payload building (no network). */
export type InvoiceLineInput = { itemId: string; itemName?: string; description: string; qty: number; rate: number };

export type InvoiceDraftInput = {
  customerId: string;
  txnDate: string;
  dueDate: string;
  termId: string | null;
  taxCodeId: string;
  lines: InvoiceLineInput[];
  customerMemo: string;
  warrantyNote: string;
  /** Office-only note, e.g. "RR Scheduler SR-1002". Not shown to the customer. */
  privateNote: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseAmount(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function lineAmount(l: Pick<InvoiceLineInput, "qty" | "rate">) {
  return round2(l.qty * l.rate);
}

export function estimateTotals(lines: Pick<InvoiceLineInput, "qty" | "rate">[], taxRatePercent: number | null) {
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const tax = taxRatePercent ? round2(subtotal * (taxRatePercent / 100)) : 0;
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** Validate a draft from the dialog (untrusted input from the browser). */
export function validateInvoiceDraft(raw: unknown): { draft: InvoiceDraftInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => String(r[k] ?? "").trim().slice(0, max);
  const customerId = str("customerId", 50);
  if (!customerId) return { error: "Match or create a QuickBooks customer first." };
  const txnDate = str("txnDate", 10), dueDate = str("dueDate", 10);
  if (!DAY.test(txnDate) || !DAY.test(dueDate)) return { error: "Enter a valid invoice date and due date." };
  if (dueDate < txnDate) return { error: "Due date can't be before the invoice date." };
  const taxCodeId = str("taxCodeId", 50) || "NON";
  const termId = str("termId", 50) || null;
  const rawLines = Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]) : [];
  if (!rawLines.length) return { error: "Add at least one line." };
  if (rawLines.length > 25) return { error: "Up to 25 lines per invoice." };
  const lines: InvoiceLineInput[] = [];
  for (const [i, l] of rawLines.entries()) {
    const itemId = String(l.itemId ?? "").trim();
    const qty = parseAmount(l.qty), rate = parseAmount(l.rate);
    if (!itemId) return { error: `Line ${i + 1}: pick a QuickBooks item.` };
    if (!(qty > 0) || qty > 100000) return { error: `Line ${i + 1}: quantity must be more than 0.` };
    if (!(rate >= 0) || rate > 10_000_000 || !/^\d+(\.\d{1,2})?$/.test(String(rate))) return { error: `Line ${i + 1}: enter a rate in dollars, up to 2 decimals.` };
    lines.push({ itemId, itemName: String(l.itemName ?? "").slice(0, 100), description: String(l.description ?? "").trim().slice(0, 4000), qty, rate });
  }
  const total = estimateTotals(lines, 0).subtotal;
  if (!(total > 0)) return { error: "Invoice total must be more than $0." };
  return {
    draft: {
      customerId, txnDate, dueDate, termId, taxCodeId, lines,
      customerMemo: str("customerMemo", 1000),
      warrantyNote: str("warrantyNote", 500),
      privateNote: str("privateNote", 4000),
    },
  };
}

/**
 * QuickBooks Invoice create body. EmailStatus is NotSet and BillEmail is not set, so
 * QuickBooks never emails the customer; RR Scheduler never calls the /send endpoint.
 */
export function buildInvoicePayload(d: InvoiceDraftInput): Record<string, unknown> {
  const taxable = d.taxCodeId !== "NON";
  const memo = [d.customerMemo, d.warrantyNote].map((s) => s.trim()).filter(Boolean).join("\n\n").slice(0, 1000);
  const payload: Record<string, unknown> = {
    CustomerRef: { value: d.customerId },
    TxnDate: d.txnDate,
    DueDate: d.dueDate,
    EmailStatus: "NotSet",
    Line: d.lines.map((l) => ({
      DetailType: "SalesItemLineDetail",
      Amount: lineAmount(l),
      Description: l.description || undefined,
      SalesItemLineDetail: {
        ItemRef: { value: l.itemId },
        Qty: l.qty,
        UnitPrice: l.rate,
        TaxCodeRef: { value: taxable ? "TAX" : "NON" },
      },
    })),
  };
  if (d.termId) payload.SalesTermRef = { value: d.termId };
  if (memo) payload.CustomerMemo = { value: memo };
  if (d.privateNote) payload.PrivateNote = d.privateNote;
  if (taxable && d.taxCodeId !== "TAX") payload.TxnTaxDetail = { TxnTaxCodeRef: { value: d.taxCodeId } };
  return payload;
}
