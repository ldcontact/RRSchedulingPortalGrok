import "server-only";
import { todayKey } from "@/lib/time";
import type { Role } from "@/lib/types";
import type { QboCustomer, QboPick, QboTaxOption, QboTerm } from "./api";
import { QboError } from "./errors";
import { invoiceView, suggestCustomer } from "./invoices";
import { canUseQboInvoices } from "./permissions";
import { getQboApi, getQboState } from "./service";
import type { InvoiceView } from "./status";
import { getQboStore } from "./store";

export type TicketInvoiceData = {
  state: "not_configured" | "disconnected" | "connected";
  sandbox: boolean;
  invoice: InvoiceView | null;
  create?: {
    items: QboPick[]; terms: QboTerm[]; taxOptions: QboTaxOption[];
    defaults: { itemId: string | null; termId: string | null; taxId: string | null };
    match: QboCustomer | null;
  };
  createError?: string;
};

/** Invoice card + create-dialog data for a ticket. Null for anyone but admins and managers. */
export async function loadTicketInvoice(opts: {
  role: Role | null | undefined;
  sr: { id: string; customer_id: string; customer_name: string; contact_email: string | null };
  wantCreate: boolean;
}): Promise<TicketInvoiceData | null> {
  if (!canUseQboInvoices(opts.role)) return null;
  const state = await getQboState().catch(() => ({ kind: "not_configured" as const }));
  if (state.kind === "not_configured" || state.kind === "error") {
    return { state: "not_configured", sandbox: state.kind === "error" ? state.config.environment === "sandbox" : true, invoice: null, createError: state.kind === "error" ? state.message : undefined };
  }
  const sandbox = state.config.environment === "sandbox";
  const store = getQboStore();
  const row = await store.getActiveInvoice(opts.sr.id).catch(() => null);
  const out: TicketInvoiceData = { state: state.kind, sandbox, invoice: row ? invoiceView(row, todayKey()) : null };
  if (!opts.wantCreate || row || state.kind !== "connected") return out;
  try {
    const c = await getQboApi(store);
    if (!c) return out;
    const { api, state: s } = c;
    const [items, terms, taxOptions, suggestion] = await Promise.all([
      api.listItems(), api.listTerms(), api.listTaxOptions(),
      suggestCustomer(api, store, { id: opts.sr.customer_id, name: opts.sr.customer_name, email: opts.sr.contact_email }),
    ]);
    out.create = {
      items, terms, taxOptions,
      defaults: { itemId: s.connection.default_item_id, termId: s.connection.default_term_id, taxId: s.connection.default_tax_code_id },
      match: suggestion?.customer ?? null,
    };
  } catch (e) {
    out.createError = e instanceof QboError ? e.message : "Couldn't load QuickBooks. Try again.";
  }
  return out;
}
