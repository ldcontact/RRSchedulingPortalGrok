import "server-only";
import type { Role } from "@/lib/types";
import { readQboConfig } from "./config";
import { invoiceView } from "./invoices";
import { canUseQboInvoices } from "./permissions";
import type { InvoiceView } from "./status";
import { getQboStore } from "./store";

/** Invoice chips for the service requests list (stored data, no QuickBooks call). Admins and managers only. */
export async function listTicketInvoices(role: Role | null | undefined, ids: string[], today: string): Promise<Record<string, InvoiceView>> {
  if (!canUseQboInvoices(role) || !ids.length || !readQboConfig()) return {};
  try {
    const rows = await getQboStore().listActiveInvoices(ids);
    return Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, invoiceView(r, today)]));
  } catch {
    return {};
  }
}
