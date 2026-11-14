import Link from "next/link";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { InvoiceStatusPill } from "@/components/qbo/invoice-status-pill";
import { formatServicePrice } from "@/lib/service-request-price";
import { fmtDateTime } from "@/lib/time";
import type { InvoiceView } from "@/lib/qbo/status";
import { refreshInvoiceStatusAction, updateQboCustomerAction } from "@/app/(app)/service-requests/invoice-actions";

export type InvoiceCardState = "not_configured" | "disconnected" | "connected";

/** Office-only invoice card on a service ticket. Never rendered for techs (page is admin/manager only). */
export function InvoiceCard({
  requestId,
  base,
  invoice,
  state,
  customerLinked = false,
}: {
  requestId: string;
  base: string;
  invoice: InvoiceView | null;
  state: InvoiceCardState;
  customerLinked?: boolean;
}) {
  const live = state === "connected";
  const sent = !!(invoice?.emailedAt);
  return (
    <div className="card" data-testid="invoice-card">
      <div className="card-hd">
        <h3 className="font-semibold">Invoice</h3>
        <span className="text-xs text-muted">Office only · hidden from techs</span>
      </div>
      {invoice ? (
        <div className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold tracking-wide text-muted uppercase">Invoice</div>
              <div className="text-lg font-semibold tabular-nums" data-testid="invoice-number">#{invoice.number}</div>
            </div>
            <InvoiceStatusPill status={invoice.status} />
          </div>
          <div className="text-2xl font-semibold tracking-tight" data-testid="invoice-amount">{formatServicePrice(invoice.amount)}</div>
          {invoice.balance > 0 && invoice.balance < invoice.amount && (
            <div className="text-[12.5px] text-muted">Balance due {formatServicePrice(invoice.balance)}</div>
          )}
          {sent && (
            <div className="text-[12.5px] text-muted" data-testid="invoice-sent">
              Sent {fmtDateTime(invoice.emailedAt!)} CT{invoice.emailedTo ? ` to ${invoice.emailedTo}` : ""}
            </div>
          )}
          <div className="text-[12.5px] text-muted">Last synced {fmtDateTime(invoice.lastSyncedAt)} CT</div>
          <div className="flex flex-wrap gap-2">
            <a href={invoice.openUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm" data-testid="open-in-qbo">
              <Icon name="open" className="size-4" />Open in QuickBooks
            </a>
            {live && (
              <form action={refreshInvoiceStatusAction.bind(null, requestId)}>
                <SubmitButton className="btn btn-sm" pendingText="Refreshing…"><Icon name="undo" className="size-4" />Refresh status</SubmitButton>
              </form>
            )}
            {live && (
              <Link href={`${base}?send=1`} scroll={false} className="btn btn-sm btn-primary" data-testid="send-invoice">
                <Icon name="mail" className="size-4" />{sent ? "Resend" : "Send invoice"}
              </Link>
            )}
            {live && invoice.status !== "paid" && (
              <Link href={`${base}?void=1`} scroll={false} className="btn btn-sm btn-danger" data-testid="void-invoice">Void</Link>
            )}
            {live && customerLinked && (
              <Link href={`${base}?update-customer=1`} scroll={false} className="btn btn-sm" data-testid="update-qbo-customer">Update customer in QuickBooks</Link>
            )}
          </div>
          <p className="text-[11.5px] text-muted">Field techs never see invoices or prices. Sending uses QuickBooks&apos; own email — RR Scheduler never emails the customer itself.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted">No invoice yet. Create a draft in QuickBooks from the service price on this ticket. Nothing is emailed to the customer.</p>
          {live ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`${base}?create=1`} scroll={false} className="btn btn-primary" data-testid="create-invoice">
                <Icon name="dollar" />Create invoice
              </Link>
              {customerLinked && (
                <Link href={`${base}?update-customer=1`} scroll={false} className="btn" data-testid="update-qbo-customer">Update customer in QuickBooks</Link>
              )}
            </div>
          ) : state === "disconnected" ? (
            <p className="text-sm text-muted" data-testid="invoice-connect-hint">Connect QuickBooks in <Link href="/settings/integrations" className="font-semibold text-brand">Settings</Link> to create an invoice. Only admins can connect.</p>
          ) : (
            <p className="text-sm text-muted" data-testid="invoice-not-configured">QuickBooks isn&apos;t set up yet. See <Link href="/settings/integrations" className="font-semibold text-brand">Settings</Link>.</p>
          )}
          <p className="text-[11.5px] text-muted">Admins and managers only. Field techs never see invoices or service prices.</p>
        </div>
      )}
    </div>
  );
}

/** Confirm dialog to fill only blank QuickBooks customer fields. */
export function UpdateQboCustomerDialog({
  requestId, base, customerName,
}: { requestId: string; base: string; customerName: string }) {
  return (
    <form action={updateQboCustomerAction.bind(null, requestId)} className="flex flex-col gap-4 p-5" data-testid="update-qbo-customer-confirm">
      <input type="hidden" name="confirm" value="1" />
      <p className="text-sm">Update <span className="font-semibold">{customerName}</span> in QuickBooks? Only blank fields will be filled in from this ticket. Values already in QuickBooks won&apos;t be overwritten.</p>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Link href={base} scroll={false} className="btn">Cancel</Link>
        <SubmitButton className="btn btn-primary" pendingText="Updating…" data-testid="update-qbo-customer-confirm-btn">Update customer in QuickBooks</SubmitButton>
      </div>
    </form>
  );
}
