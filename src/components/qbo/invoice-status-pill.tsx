import { QBO_INVOICE_STATUS_LABEL, QBO_INVOICE_STATUS_TONE, QBO_LIST_CHIP, type QboInvoice, type QboInvoiceStatus } from "@/lib/qbo-mock";

export function InvoiceStatusPill({ status, className = "" }: { status: QboInvoiceStatus; className?: string }) {
  return (
    <span className={`pill ${QBO_INVOICE_STATUS_TONE[status]} ${className}`} data-testid="invoice-status">
      <span className="size-1.5 rounded-full bg-current" />
      {QBO_INVOICE_STATUS_LABEL[status]}
    </span>
  );
}

export function InvoiceListChip({ invoice }: { invoice: QboInvoice }) {
  return (
    <span className={`pill ${QBO_INVOICE_STATUS_TONE[invoice.status]}`} data-testid="invoice-chip" title={QBO_INVOICE_STATUS_LABEL[invoice.status]}>
      {QBO_LIST_CHIP[invoice.status](invoice.number)}
    </span>
  );
}
