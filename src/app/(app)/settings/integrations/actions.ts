"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { disconnectQbo } from "@/lib/qbo/connect";
import { QboError } from "@/lib/qbo/errors";
import { canManageQboConnection, canUseQboInvoices } from "@/lib/qbo/permissions";
import { getQboApi, getQboState, qboFetch } from "@/lib/qbo/service";
import { getQboStore } from "@/lib/qbo/store";

const BASE = "/settings/integrations";
const go = (kind: "ok" | "error", msg: string): never => {
  revalidatePath(BASE);
  redirect(`${BASE}?${kind}=${encodeURIComponent(msg)}`);
};

/** Default item / terms / tax used to prefill a new invoice. Admins and managers. */
export async function saveQboDefaultsAction(fd: FormData) {
  const u = await requireRole("admin", "manager");
  if (!canUseQboInvoices(u.role)) redirect("/?denied=1");
  const c = await getQboApi();
  if (!c) go("error", "QuickBooks isn't connected.");
  const { api } = c!;
  const pick = (k: string) => String(fd.get(k) ?? "").trim();
  let msg = "QuickBooks defaults saved.";
  let kind: "ok" | "error" = "ok";
  try {
    const itemChoice = pick("item");
    const [items, terms, taxes] = await Promise.all([api.listItems(), api.listTerms(), api.listTaxOptions()]);
    const item = itemChoice === "__create__" ? await api.ensureServiceItem() : items.find((i) => i.id === itemChoice) ?? null;
    const term = terms.find((t) => t.id === pick("term")) ?? null;
    const tax = taxes.find((t) => t.id === pick("tax")) ?? taxes[0];
    await getQboStore().updateConnection({
      default_item_id: item?.id ?? null, default_item_name: item?.name ?? null,
      default_term_id: term?.id ?? null, default_term_name: term?.name ?? null,
      default_tax_code_id: tax?.id ?? "NON", default_tax_code_name: tax?.name ?? "Non-taxable",
      last_sync_at: new Date().toISOString(),
    });
  } catch (e) {
    msg = e instanceof QboError ? e.message : "Couldn't save QuickBooks defaults."; kind = "error";
  }
  go(kind, msg);
}

/** Admin only, after the confirm dialog: revoke at Intuit and delete the stored tokens. */
export async function disconnectQboAction(fd: FormData) {
  const u = await requireRole("admin", "manager");
  if (!canManageQboConnection(u.role)) go("error", "Only an admin can disconnect QuickBooks.");
  if (String(fd.get("confirm") ?? "") !== "1") go("error", "Confirm to disconnect QuickBooks.");
  const state = await getQboState();
  if (state.kind !== "connected") go("error", "QuickBooks is not connected.");
  const s = state as Extract<typeof state, { kind: "connected" }>;
  await disconnectQbo({ config: s.config, store: getQboStore(), fetchImpl: qboFetch(s.config) });
  go("ok", `QuickBooks (${s.connection.company_name}) was disconnected. Existing invoices in QuickBooks were not changed.`);
}
