"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { todayKey } from "@/lib/time";
import { ticketNo } from "@/lib/types";
import type { QboCustomer } from "@/lib/qbo/api";
import { QboError } from "@/lib/qbo/errors";
import { validateInvoiceDraft } from "@/lib/qbo/invoice";
import { createInvoiceForTicket, invoiceCreatedHistory, invoiceVoidedHistory, refreshInvoice, voidInvoiceForTicket } from "@/lib/qbo/invoices";
import { canUseQboInvoices } from "@/lib/qbo/permissions";
import { getQboApi } from "@/lib/qbo/service";
import { getQboStore } from "@/lib/qbo/store";
import { invoiceNumberLabel } from "@/lib/qbo/status";

/*
 * QuickBooks invoices from a service request. Admins and managers only (checked here on the
 * server, not just hidden in the UI). Invoices are created as drafts: EmailStatus NotSet and
 * RR Scheduler never calls QuickBooks' /send, so nothing is emailed to the customer.
 */
const office = async () => {
  const u = await requireRole("admin", "manager");
  if (!canUseQboInvoices(u.role)) redirect("/?denied=1");
  return u;
};
const friendly = (e: unknown) => (e instanceof QboError ? e.message : e instanceof Error && /already has an invoice|duplicate key/i.test(e.message) ? "This ticket already has an invoice." : "Something went wrong talking to QuickBooks. Try again.");
const refresh = (id: string) => { revalidatePath("/service-requests", "layout"); revalidatePath(`/service-requests/${id}`); };
const go = (id: string, msg: string, kind: "ok" | "error" = "ok"): never => {
  refresh(id);
  redirect(`/service-requests/${id}?${kind}=${encodeURIComponent(msg)}`);
};
async function connected() {
  const c = await getQboApi();
  if (!c) throw new QboError("QuickBooks isn't connected. An admin can connect it in Settings.");
  return c;
}

export type CustomerSearchResult = { customers: QboCustomer[] } | { error: string };
export async function searchQboCustomersAction(q: string): Promise<CustomerSearchResult> {
  await office();
  try {
    const { api } = await connected();
    return { customers: await api.searchCustomers(String(q ?? "").slice(0, 100)) };
  } catch (e) {
    return { error: friendly(e) };
  }
}

/** Create the ticket's customer in QuickBooks, or reuse the one with the same name (no duplicates). */
export async function createQboCustomerAction(serviceRequestId: string): Promise<{ customer: QboCustomer; existed: boolean } | { error: string }> {
  const user = await office();
  try {
    const repo = await getRepo();
    const sr = await repo.getServiceRequest(serviceRequestId);
    if (!sr) return { error: "Service request not found." };
    const cust = await repo.getCustomer(sr.customer_id);
    const { api } = await connected();
    const r = await api.createCustomer({
      name: sr.customer_name, email: cust?.email ?? sr.contact_email, phone: cust?.phone ?? sr.contact_phone,
      address: cust?.address ?? sr.site_address, city: cust?.city ?? sr.site_city, state: cust?.state ?? sr.site_state, zip: cust?.zip ?? sr.site_zip,
    });
    await getQboStore().setCustomerLink({
      customer_id: sr.customer_id, realm_id: api.realmId, qbo_customer_id: r.customer.id, qbo_display_name: r.customer.name,
      linked_by: user.id, linked_at: new Date().toISOString(),
    });
    return r;
  } catch (e) {
    return { error: friendly(e) };
  }
}

export type CreateInvoiceResult = { ok: string } | { error: string };
export async function createInvoiceAction(serviceRequestId: string, raw: unknown): Promise<CreateInvoiceResult> {
  const user = await office();
  const parsed = validateInvoiceDraft(raw);
  if ("error" in parsed) return { error: parsed.error };
  try {
    const repo = await getRepo();
    const sr = await repo.getServiceRequest(serviceRequestId);
    if (!sr) return { error: "Service request not found." };
    const { api, state } = await connected();
    const row = await createInvoiceForTicket({
      api, store: getQboStore(), environment: state.config.environment, serviceRequestId, portalCustomerId: sr.customer_id,
      draft: { ...parsed.draft, privateNote: `RR Scheduler ${ticketNo(sr.number)}` }, user,
    });
    const number = invoiceNumberLabel(row.doc_number, row.qbo_invoice_id);
    await repo.addServiceRequestEvent(serviceRequestId, { kind: "invoice", body: invoiceCreatedHistory(number, Number(row.total)) });
    refresh(serviceRequestId);
    return { ok: `Invoice #${number} created as a draft in QuickBooks. Nothing was emailed to the customer.` };
  } catch (e) {
    return { error: friendly(e) };
  }
}

export async function refreshInvoiceStatusAction(serviceRequestId: string) {
  await office();
  let msg = "Invoice status refreshed from QuickBooks.";
  let kind: "ok" | "error" = "ok";
  try {
    const store = getQboStore();
    const row = await store.getActiveInvoice(serviceRequestId);
    if (!row) throw new QboError("This ticket has no invoice.");
    const { api } = await connected();
    await refreshInvoice(api, store, row, todayKey());
  } catch (e) {
    msg = friendly(e); kind = "error";
  }
  go(serviceRequestId, msg, kind);
}

export async function voidInvoiceAction(serviceRequestId: string, fd: FormData) {
  const user = await office();
  if (String(fd.get("confirm") ?? "") !== "1") go(serviceRequestId, "Confirm to void the invoice.", "error");
  let msg: string;
  let kind: "ok" | "error" = "ok";
  try {
    const store = getQboStore();
    const row = await store.getActiveInvoice(serviceRequestId);
    if (!row) throw new QboError("This ticket has no invoice.");
    const { api } = await connected();
    await voidInvoiceForTicket(api, store, row, user, todayKey());
    const number = invoiceNumberLabel(row.doc_number, row.qbo_invoice_id);
    await (await getRepo()).addServiceRequestEvent(serviceRequestId, { kind: "invoice", body: invoiceVoidedHistory(number, Number(row.total)) });
    msg = `Invoice #${number} was voided in QuickBooks. Nothing was emailed to the customer.`;
  } catch (e) {
    msg = friendly(e); kind = "error";
  }
  go(serviceRequestId, msg, kind);
}
