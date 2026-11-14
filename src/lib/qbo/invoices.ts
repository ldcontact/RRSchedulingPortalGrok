import type { QboApi, QboCustomer } from "./api";
import { invoiceRecordFrom } from "./api";
import { qboInvoiceAppUrl, type QboEnvironment } from "./config";
import { desiredCustomerFromPortal, isValidEmail, sparseCustomerPatch, type PortalCustomerSnapshot } from "./customer";
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
    emailedAt: row.emailed_at ?? null,
    emailedTo: row.emailed_to ?? null,
  };
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function invoiceCreatedHistory(number: string, total: number) {
  return `Invoice #${number} created in QuickBooks as a draft (${money(total)}). Nothing was emailed to the customer.`;
}
export function invoiceVoidedHistory(number: string, total: number) {
  return `Invoice #${number} (${money(total)}) voided in QuickBooks.`;
}
export function invoiceEmailedHistory(number: string, email: string, userName: string) {
  return `Invoice #${number} emailed to ${email} by ${userName}.`;
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

/**
 * Sparse-update a linked QuickBooks customer: fill only blank fields, never overwrite
 * values someone edited in QuickBooks. Nested addresses are merged field-by-field.
 */
export async function fillLinkedCustomer(api: QboApi, store: QboStore, portalCustomerId: string, snapshot: PortalCustomerSnapshot): Promise<"updated" | "unchanged" | "missing" | "unlinked"> {
  const link = await store.getCustomerLink(portalCustomerId, api.realmId);
  if (!link) return "unlinked";
  const existing = await api.getCustomerEntity(link.qbo_customer_id);
  if (!existing) return "missing";
  const patch = sparseCustomerPatch(existing, desiredCustomerFromPortal(snapshot));
  if (!patch) return "unchanged";
  const updated = await api.updateCustomerSparse(link.qbo_customer_id, patch, existing.SyncToken);
  await store.setCustomerLink({
    ...link,
    qbo_display_name: updated.DisplayName ?? link.qbo_display_name,
  });
  return "updated";
}

/** Create the invoice in QuickBooks (never emailed), remember the customer link, and save the mapping row. */
export async function createInvoiceForTicket(opts: {
  api: QboApi; store: QboStore; environment: QboEnvironment;
  serviceRequestId: string; portalCustomerId: string; draft: InvoiceDraftInput;
  user: { id: string }; customerName?: string; portalSnapshot?: PortalCustomerSnapshot;
}): Promise<ServiceRequestInvoiceRow> {
  const { api, store, environment, serviceRequestId, portalCustomerId, draft, user, portalSnapshot } = opts;
  if (await store.getActiveInvoice(serviceRequestId)) throw new QboError("This ticket already has an invoice. Void it first to create a new one.");
  const customer = await api.getCustomer(draft.customerId);
  if (!customer) throw new QboError("That QuickBooks customer no longer exists. Pick another.");
  const now = new Date().toISOString();
  await store.setCustomerLink({
    customer_id: portalCustomerId, realm_id: api.realmId, qbo_customer_id: customer.id, qbo_display_name: customer.name,
    linked_by: user.id, linked_at: now,
  });
  if (portalSnapshot) {
    await fillLinkedCustomer(api, store, portalCustomerId, portalSnapshot).catch(() => "unlinked");
  }
  const created = await api.createInvoice(buildInvoicePayload(draft));
  const rec = invoiceRecordFrom(created);
  return store.insertInvoice({
    service_request_id: serviceRequestId, realm_id: api.realmId, environment,
    qbo_invoice_id: rec.qboInvoiceId, doc_number: rec.docNumber, total: rec.total, balance: rec.balance,
    email_status: rec.emailStatus, due_date: rec.dueDate, txn_date: rec.txnDate,
    status: deriveInvoiceStatus(rec, now.slice(0, 10)), voided_at: null, voided_by: null,
    created_by: user.id, synced_at: now, emailed_at: null, emailed_to: null,
  });
}

/** Pull Balance / EmailStatus / DueDate from QuickBooks and store them. Optionally fill blank customer fields. */
export async function refreshInvoice(api: QboApi, store: QboStore, row: ServiceRequestInvoiceRow, today: string, opts?: { portalCustomerId?: string; portalSnapshot?: PortalCustomerSnapshot }) {
  if (opts?.portalCustomerId && opts.portalSnapshot) {
    await fillLinkedCustomer(api, store, opts.portalCustomerId, opts.portalSnapshot).catch(() => "unlinked");
  }
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

/**
 * Ask QuickBooks to email the invoice (POST /invoice/{id}/send?sendTo=). The portal never
 * sends the email itself. Staff must confirm; this does not run on create.
 */
export async function sendInvoiceForTicket(opts: {
  api: QboApi; store: QboStore; row: ServiceRequestInvoiceRow;
  sendTo: string; user: { id: string; name: string }; today: string;
}): Promise<{ row: ServiceRequestInvoiceRow; history: string }> {
  const email = opts.sendTo.trim();
  if (!isValidEmail(email)) throw new QboError("Enter a valid email address.");
  const inv = await opts.api.sendInvoice(opts.row.qbo_invoice_id, email);
  const rec = invoiceRecordFrom(inv);
  const now = new Date().toISOString();
  const emailStatus = rec.emailStatus && rec.emailStatus !== "NotSet" ? rec.emailStatus : "EmailSent";
  const patch: Partial<ServiceRequestInvoiceRow> = {
    doc_number: rec.docNumber, total: rec.total, balance: rec.balance, email_status: emailStatus,
    due_date: rec.dueDate, txn_date: rec.txnDate,
    status: deriveInvoiceStatus({ ...rec, emailStatus }, opts.today),
    emailed_at: now, emailed_to: email, synced_at: now,
  };
  await opts.store.updateInvoice(opts.row.id, patch);
  const number = invoiceNumberLabel(patch.doc_number ?? opts.row.doc_number, opts.row.qbo_invoice_id);
  return {
    row: { ...opts.row, ...patch },
    history: invoiceEmailedHistory(number, email, opts.user.name),
  };
}
