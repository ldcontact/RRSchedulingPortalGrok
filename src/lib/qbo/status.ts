/** Invoice status shown in RR Scheduler, derived from QuickBooks fields. */
export type QboInvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type QboInvoiceRecord = {
  qboInvoiceId: string;
  docNumber: string | null;
  total: number;
  balance: number;
  emailStatus: string | null;
  dueDate: string | null;
  txnDate: string | null;
};

/**
 * Paid: balance is 0 on a non-zero total. Overdue: open balance past the due date.
 * Sent: QuickBooks EmailStatus is EmailSent (someone sent it from QuickBooks). Otherwise Draft (not sent yet).
 * `today` is YYYY-MM-DD in Central time.
 */
export function deriveInvoiceStatus(r: Pick<QboInvoiceRecord, "total" | "balance" | "emailStatus" | "dueDate">, today: string): QboInvoiceStatus {
  const total = Number(r.total) || 0;
  const balance = Number(r.balance) || 0;
  if (total > 0 && balance <= 0.004) return "paid";
  if (balance > 0 && r.dueDate && r.dueDate < today) return "overdue";
  if (r.emailStatus === "EmailSent") return "sent";
  return "draft";
}

export const QBO_INVOICE_STATUS_LABEL: Record<QboInvoiceStatus, string> = {
  draft: "Draft in QuickBooks",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

export const QBO_INVOICE_STATUS_TONE: Record<QboInvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-sky-100 text-sky-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-50 text-red-700",
};

export function invoiceNumberLabel(docNumber: string | null | undefined, qboInvoiceId: string) {
  return docNumber?.trim() ? docNumber.trim() : `ID ${qboInvoiceId}`;
}

export function invoiceListChipText(status: QboInvoiceStatus, number: string) {
  if (status === "paid") return "Paid";
  const label = status === "draft" ? "Draft" : status === "sent" ? "Sent" : "Overdue";
  return `${label} #${number}`;
}

/** Shape the ticket card and list chip render. Office only. */
export type InvoiceView = {
  number: string;
  amount: number;
  balance: number;
  status: QboInvoiceStatus;
  lastSyncedAt: string;
  openUrl: string;
};
