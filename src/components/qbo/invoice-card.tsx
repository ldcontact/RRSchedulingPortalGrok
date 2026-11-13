import Link from "next/link";
import { Icon } from "@/components/icons";
import { InvoiceStatusPill } from "@/components/qbo/invoice-status-pill";
import { formatQboSync, invoiceHref, money, type QboInvoice } from "@/lib/qbo-mock";

export function InvoiceCard({
  base,
  invoice,
  canCreate,
}: {
  base: string;
  invoice: QboInvoice | null;
  canCreate: boolean;
}) {
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
          <div className="text-2xl font-semibold tracking-tight" data-testid="invoice-amount">{money(invoice.amount)}</div>
          <div className="text-[12.5px] text-muted">Last synced {formatQboSync(invoice.lastSyncedAt)}</div>
          <div className="flex flex-wrap gap-2">
            <a href="#mock-qbo" className="btn btn-sm" data-testid="open-in-qbo" title="DEV MOCK MODE — no real QuickBooks company">
              <Icon name="open" className="size-4" />Open in QuickBooks
            </a>
            {invoice.status !== "paid" && (
              <Link href={invoiceHref(base, { invoice: invoice.status, void: "1" })} scroll={false} className="btn btn-sm btn-danger" data-testid="void-invoice">Void</Link>
            )}
          </div>
          <p className="text-[11.5px] text-muted">Design mock — this draft is not in a real QuickBooks company. Field techs never see invoices or prices. Nothing is emailed to the customer.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted">No invoice yet. Create a draft in QuickBooks from the service price on this ticket. Nothing is emailed to the customer.</p>
          {canCreate ? (
            <Link href={invoiceHref(base, { invoice: "none", create: "1" })} scroll={false} className="btn btn-primary" data-testid="create-invoice">
              <Icon name="dollar" />Create invoice
            </Link>
          ) : (
            <p className="text-sm text-muted">Connect QuickBooks in Settings to create an invoice. Only admins can connect.</p>
          )}
          <p className="text-[11.5px] text-muted">Admins and managers only. Field techs never see invoices or service prices.</p>
        </div>
      )}
    </div>
  );
}
