import type { QboApi, QboCustomer } from "./api";
import { invoiceRecordFrom } from "./api";
import { qboInvoiceAppUrl, type QboEnvironment } from "./config";
import { QboError } from "./errors";
import { buildInvoicePayload, type InvoiceDraftInput } from "./invoice";
import { deriveInvoiceStatus, invoiceNumberLabel, type InvoiceView } from "./status";
import type { QboStore, ServiceRequestInvoiceRow } from "./store";

export function invoiceView(row: ServiceRequestInvoiceRow, today: string): InvoiceView {
  return {
    number: invoiceNumberLabel(row.doc_number, row.qbo_invoice_id),
    amount: Number(row.total),
    balance: Number(row.balance),
    status: deriveInvoiceStatus({ total: Number(row.total), balance: Number(row.balance), emailStatus: row.email_status, dueDate: row.due_date }, today),
    lastSyncedAt: row.synced_at,
    openUrl: qboInvoiceAppUrl(row.environment, row.qbo_invoice_id),
  };
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function invoiceCreatedHistory(number: string, total: number) {
  return `Invoice #${number} created in QuickBooks as a draft (${money(total)}). Nothing was emailed to the customer.`;
}
export function invoiceVoidedHistory(number: string, total: number) {
  return `Invoice #${number} (${money(total)}) voided in QuickBooks.`;
}

/**
 * Suggest the QuickBooks customer for a portal customer: an existing link first, then a unique
 * exact display-name match, then a unique email match. Returns null when the user must pick.
 */
export async function suggestCustomer(api: QboApi, store: QboStore, portal: { id: string; name: string; email: string | null }): Promise<{ customer: QboCustomer; linked: boolean } | null> {
  const link = await store.getCustomerLink(portal.id, api.realmId);
  if (link) {
    const c = await api.getCustomer(link.qbo_customer_id);
    if (c) return { customer: c, linked: true };
  }
  const byName = await api.customerByDisplayName(portal.name);
  if (byName) return { customer: byName, linked: false };
  const byEmail = portal.email ? await api.customerByEmail(portal.email) : [];
  if (byEmail.length === 1) return { customer: byEmail[0], linked: false };
  return null;
}

/** Create the invoice in QuickBooks (never emailed), remember the customer link, and save the mapping row. */
export async function createInvoiceForTicket(opts: {
  api: QboApi; store: QboStore; environment: QboEnvironment;
  serviceRequestId: string; portalCustomerId: string; draft: InvoiceDraftInput;
  user: { id: string }; customerName?: string;
}): Promise<ServiceRequestInvoiceRow> {
  const { api, store, environment, serviceRequestId, portalCustomerId, draft, user } = opts;
  if (await store.getActiveInvoice(serviceRequestId)) throw new QboError("This ticket already has an invoice. Void it first to create a new one.");
  const customer = await api.getCustomer(draft.customerId);
  if (!customer) throw new QboError("That QuickBooks customer no longer exists. Pick another.");
  const created = await api.createInvoice(buildInvoicePayload(draft));
  const rec = invoiceRecordFrom(created);
  const now = new Date().toISOString();
  await store.setCustomerLink({
    customer_id: portalCustomerId, realm_id: api.realmId, qbo_customer_id: customer.id, qbo_display_name: customer.name,
    linked_by: user.id, linked_at: now,
  });
  return store.insertInvoice({
    service_request_id: serviceRequestId, realm_id: api.realmId, environment,
    qbo_invoice_id: rec.qboInvoiceId, doc_number: rec.docNumber, total: rec.total, balance: rec.balance,
    email_status: rec.emailStatus, due_date: rec.dueDate, txn_date: rec.txnDate,
    status: deriveInvoiceStatus(rec, now.slice(0, 10)), voided_at: null, voided_by: null,
    created_by: user.id, synced_at: now,
  });
}

/** Pull Balance / EmailStatus / DueDate from QuickBooks and store them. */
export async function refreshInvoice(api: QboApi, store: QboStore, row: ServiceRequestInvoiceRow, today: string) {
  const rec = invoiceRecordFrom(await api.getInvoice(row.qbo_invoice_id));
  const patch = {
    doc_number: rec.docNumber, total: rec.total, balance: rec.balance, email_status: rec.emailStatus,
    due_date: rec.dueDate, txn_date: rec.txnDate, status: deriveInvoiceStatus(rec, today), synced_at: new Date().toISOString(),
  };
  await store.updateInvoice(row.id, patch);
  return { ...row, ...patch };
}

/** QuickBooks void operation (not delete), then free the ticket for a new invoice. Paid invoices can't be voided here. */
export async function voidInvoiceForTicket(api: QboApi, store: QboStore, row: ServiceRequestInvoiceRow, user: { id: string }, today: string) {
  const current = invoiceRecordFrom(await api.getInvoice(row.qbo_invoice_id));
  if (deriveInvoiceStatus(current, today) === "paid") throw new QboError("This invoice is paid in QuickBooks, so it can't be voided here.");
  await api.voidInvoice(row.qbo_invoice_id);
  const now = new Date().toISOString();
  await store.updateInvoice(row.id, { voided_at: now, voided_by: user.id, status: "voided", balance: 0, synced_at: now });
}
