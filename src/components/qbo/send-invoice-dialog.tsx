"use client";
import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { formatServicePrice } from "@/lib/service-request-price";
import { sendInvoiceAction } from "@/app/(app)/service-requests/invoice-actions";

/** Confirm that QuickBooks (not the portal) will email the invoice. Admins and managers only. */
export function SendInvoiceDialog({
  requestId,
  base,
  ticketNo,
  invoiceNumber,
  amount,
  defaultEmail,
  resend,
}: {
  requestId: string;
  base: string;
  ticketNo: string;
  invoiceNumber: string;
  amount: number;
  defaultEmail: string;
  resend: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const to = email.trim();
  return (
    <Modal title={resend ? "Resend this invoice?" : "Send this invoice?"} sub="QuickBooks will send the email" closeHref={base}>
      <form action={sendInvoiceAction.bind(null, requestId)} className="flex flex-col gap-4 p-5" data-testid="send-invoice-confirm">
        <input type="hidden" name="confirm" value="1" />
        <p className="text-sm">
          Invoice <span className="font-semibold tabular-nums">#{invoiceNumber}</span> of{" "}
          <span className="font-semibold">{formatServicePrice(amount)}</span> on {ticketNo}.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">To email</span>
          <input
            className="input"
            type="email"
            name="send_to"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            data-testid="send-invoice-email"
          />
        </label>
        <p className="text-sm" data-testid="send-invoice-copy">
          QuickBooks will email invoice #{invoiceNumber} to {to || "the address you enter"}.
        </p>
        <p className="text-[12.5px] text-muted">RR Scheduler will not send the email itself. Field techs never see invoices.</p>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Link href={base} scroll={false} className="btn">Cancel</Link>
          <SubmitButton className="btn btn-primary" pendingText="Sending…" data-testid="send-invoice-confirm-btn">{resend ? "Resend from QuickBooks" : "Send from QuickBooks"}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
