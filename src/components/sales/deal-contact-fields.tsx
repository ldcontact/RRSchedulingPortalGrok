"use client";

import { AddressFields } from "@/components/address-autocomplete";
import type { SalesDeal } from "@/lib/sales/types";

export function DealContactFields({
  deal,
  consentNote,
}: {
  deal?: Pick<SalesDeal, "title" | "contact_name" | "contact_phone" | "contact_email" | "address" | "city" | "state" | "zip" | "sms_consent" | "sms_consent_at" | "sms_consent_by"> | null;
  consentNote?: string | null;
}) {
  return (
    <>
      <label className="label">Deal name
        <input className="input" name="title" defaultValue={deal?.title ?? ""} placeholder="Defaults to the street address" />
      </label>
      <label className="label">Customer name
        <input className="input" name="contact_name" defaultValue={deal?.contact_name ?? ""} placeholder="Tom Brennan" autoComplete="name" />
      </label>
      <label className="label">Email
        <input className="input" name="contact_email" type="email" defaultValue={deal?.contact_email ?? ""} placeholder="name@email.com" autoComplete="email" />
      </label>
      <div className="flex flex-col gap-1.5">
        <label className="label">Phone
          <input className="input" name="contact_phone" type="tel" defaultValue={deal?.contact_phone ?? ""} placeholder="(847) 555-0104" autoComplete="tel" />
        </label>
        <label className="flex items-start gap-2 text-sm leading-snug">
          <input type="checkbox" name="sms_consent" value="yes" defaultChecked={!!deal?.sms_consent} className="mt-1" />
          <span>This is a cell phone, OK to text</span>
        </label>
        <p className="text-xs text-muted">Texting is off in Sales right now. Checking this records consent; nothing is sent automatically.</p>
        {consentNote ? <p className="text-xs text-muted">{consentNote}</p> : null}
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold">Address</div>
        <AddressFields
          defaults={{
            address: deal?.address ?? "",
            city: deal?.city ?? "",
            state: deal?.state || "IL",
            zip: deal?.zip ?? "",
          }}
        />
      </div>
    </>
  );
}
