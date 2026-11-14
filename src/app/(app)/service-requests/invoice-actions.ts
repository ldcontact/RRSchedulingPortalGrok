"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { todayKey } from "@/lib/time";
import { ticketNo } from "@/lib/types";
import type { QboCustomer } from "@/lib/qbo/api";
import { isValidEmail, snapshotFromRecords, formatServiceLocation } from "@/lib/qbo/customer";
import { QboError } from "@/lib/qbo/errors";
import { validateInvoiceDraft, withServiceLocationMemo, type InvoiceShipAddr } from "@/lib/qbo/invoice";
import { createInvoiceForTicket, fillLinkedCustomer, invoiceCreatedHistory, invoiceVoidedHistory, refreshInvoice, sendInvoiceForTicket, voidInvoiceForTicket } from "@/lib/qbo/invoices";
import { canUseQboInvoices } from "@/lib/qbo/permissions";
import { getQboApi } from "@/lib/qbo/service";
import { getQboStore } from "@/lib/qbo/store";
import { invoiceNumberLabel } from "@/lib/qbo/status";
import type { Customer, Contact, ServiceRequestView } from "@/lib/types";

/*
 * QuickBooks invoices from a service request. Admins and managers only (checked here on the
 * server, not just hidden in the UI). Invoices are created as drafts: EmailStatus NotSet.
 * The only send is sendInvoiceAction, which calls QuickBooks POST /invoice/{id}/send?sendTo=
 * after staff confirm. RR Scheduler never sends the email itself (no portal email, SMTP, or Gmail).
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

async function portalSnapshot(repo: Awaited<ReturnType<typeof getRepo>>, sr: ServiceRequestView) {
  const [cust, contacts] = await Promise.all([repo.getCustomer(sr.customer_id), repo.listContacts(sr.customer_id)]);
  const primary = (contacts as Contact[]).find((c) => c.is_primary) ?? (contacts as Contact[])[0] ?? null;
  return snapshotFromRecords({
    customer: (cust as Customer | null) ?? { id: sr.customer_id, name: sr.customer_name, email: sr.contact_email, phone: sr.contact_phone },
    contact: primary,
    site: {
      address: sr.site_address, city: sr.site_city, state: sr.site_state, zip: sr.site_zip,
      contactName: sr.contact_name, contactEmail: sr.contact_email, contactPhone: sr.contact_phone,
    },
  });
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
    const { api } = await connected();
    const snapshot = await portalSnapshot(repo, sr);
    const r = await api.createCustomer(snapshot);
    await getQboStore().setCustomerLink({
      customer_id: sr.customer_id, realm_id: api.realmId, qbo_customer_id: r.customer.id, qbo_display_name: r.customer.name,
      linked_by: user.id, linked_at: new Date().toISOString(),
    });
    return r;
  } catch (e) {
    return { error: friendly(e) };
  }
}

/**
 * Fill only blank fields on the already-linked QuickBooks customer. Never overwrites
 * values edited in QuickBooks. Used to fix customers created before full mapping.
 */
export async function updateQboCustomerAction(serviceRequestId: string, fd: FormData) {
  await office();
  if (String(fd.get("confirm") ?? "") !== "1") go(serviceRequestId, "Confirm to update the QuickBooks customer.", "error");
  let msg: string;
  let kind: "ok" | "error" = "ok";
  try {
    const repo = await getRepo();
    const sr = await repo.getServiceRequest(serviceRequestId);
    if (!sr) throw new QboError("Service request not found.");
    const { api } = await connected();
    const result = await fillLinkedCustomer(api, getQboStore(), sr.customer_id, await portalSnapshot(repo, sr));
    if (result === "unlinked") throw new QboError("This customer isn't linked to QuickBooks yet. Create or match them when you create an invoice.");
    if (result === "missing") throw new QboError("That QuickBooks customer no longer exists. Pick another when you create an invoice.");
    msg = result === "updated"
      ? `Updated blank QuickBooks fields for ${sr.customer_name}. Existing QuickBooks values were left alone.`
      : `QuickBooks already has these fields filled in for ${sr.customer_name}. Nothing was overwritten.`;
  } catch (e) {
    msg = friendly(e); kind = "error";
  }
  go(serviceRequestId, msg, kind);
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
    const snapshot = await portalSnapshot(repo, sr);
    const ship: InvoiceShipAddr | null = parsed.draft.shipAddr ?? (snapshot.siteAddress || snapshot.address ? {
      line1: snapshot.siteAddress || snapshot.address || "",
      city: snapshot.siteCity || snapshot.city || "",
      state: snapshot.siteState || snapshot.state || "",
      zip: snapshot.siteZip || snapshot.zip || "",
      country: "US",
    } : null);
    const billEmail = parsed.draft.billEmail || snapshot.email || snapshot.contactEmail || null;
    const location = formatServiceLocation({
      address: snapshot.siteAddress || snapshot.address,
      city: snapshot.siteCity || snapshot.city,
      state: snapshot.siteState || snapshot.state,
      zip: snapshot.siteZip || snapshot.zip,
    });
    const { api, state } = await connected();
    const row = await createInvoiceForTicket({
      api, store: getQboStore(), environment: state.config.environment, serviceRequestId, portalCustomerId: sr.customer_id,
      draft: {
        ...parsed.draft,
        privateNote: parsed.draft.privateNote || `RR Scheduler ${ticketNo(sr.number)}`,
        customerMemo: withServiceLocationMemo(parsed.draft.customerMemo, location),
        billEmail,
        shipAddr: ship,
      },
      user,
      portalSnapshot: snapshot,
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
    const repo = await getRepo();
    const sr = await repo.getServiceRequest(serviceRequestId);
    const { api } = await connected();
    await refreshInvoice(api, store, row, todayKey(), sr ? { portalCustomerId: sr.customer_id, portalSnapshot: await portalSnapshot(repo, sr) } : undefined);
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

/** Staff-confirmed send only. Calls QuickBooks' own /send; the portal does not email anyone. */
export async function sendInvoiceAction(serviceRequestId: string, fd: FormData) {
  const user = await office();
  if (String(fd.get("confirm") ?? "") !== "1") go(serviceRequestId, "Confirm to send the invoice from QuickBooks.", "error");
  const sendTo = String(fd.get("send_to") ?? "").trim();
  if (!isValidEmail(sendTo)) go(serviceRequestId, "Enter a valid email address.", "error");
  let msg: string;
  let kind: "ok" | "error" = "ok";
  try {
    const store = getQboStore();
    const row = await store.getActiveInvoice(serviceRequestId);
    if (!row) throw new QboError("This ticket has no invoice.");
    const { api } = await connected();
    const r = await sendInvoiceForTicket({ api, store, row, sendTo, user: { id: user.id, name: user.name }, today: todayKey() });
    await (await getRepo()).addServiceRequestEvent(serviceRequestId, { kind: "invoice", body: r.history });
    const number = invoiceNumberLabel(r.row.doc_number, r.row.qbo_invoice_id);
    msg = `QuickBooks emailed invoice #${number} to ${sendTo}.`;
  } catch (e) {
    msg = friendly(e); kind = "error";
  }
  go(serviceRequestId, msg, kind);
}
