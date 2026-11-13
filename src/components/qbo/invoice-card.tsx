import Link from "next/link";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { InvoiceStatusPill } from "@/components/qbo/invoice-status-pill";
import { formatServicePrice } from "@/lib/service-request-price";
import { fmtDateTime } from "@/lib/time";
import type { InvoiceView } from "@/lib/qbo/status";
import { refreshInvoiceStatusAction } from "@/app/(app)/service-requests/invoice-actions";

export type InvoiceCardState = "not_configured" | "disconnected" | "connected";

/** Office-only invoice card on a service ticket. Never rendered for techs (page is admin/manager only). */
export function InvoiceCard({
  requestId,
  base,
  invoice,
  state,
}: {
  requestId: string;
  base: string;
  invoice: InvoiceView | null;
  state: InvoiceCardState;
}) {
  const live = state === "connected";
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
            {live && invoice.status !== "paid" && (
              <Link href={`${base}?void=1`} scroll={false} className="btn btn-sm btn-danger" data-testid="void-invoice">Void</Link>
            )}
          </div>
          <p className="text-[11.5px] text-muted">Field techs never see invoices or prices. Nothing is emailed to the customer from RR Scheduler.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted">No invoice yet. Create a draft in QuickBooks from the service price on this ticket. Nothing is emailed to the customer.</p>
          {live ? (
            <Link href={`${base}?create=1`} scroll={false} className="btn btn-primary" data-testid="create-invoice">
              <Icon name="dollar" />Create invoice
            </Link>
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
