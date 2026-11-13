"use client";

import Link from "next/link";
import { AddressFields } from "@/components/address-autocomplete";
import {
  SMS_CONSENT_LABEL,
  SMS_CONSENT_LEGAL_TEXT,
  SMS_CONSENT_OFF_NOTE,
} from "@/lib/sales/deal-contact";
import type { SalesDeal } from "@/lib/sales/types";

const POLICY_TAIL = "See our Privacy Policy.";

function ConsentLegalText() {
  const body = SMS_CONSENT_LEGAL_TEXT.endsWith(POLICY_TAIL)
    ? SMS_CONSENT_LEGAL_TEXT.slice(0, -POLICY_TAIL.length).trimEnd()
    : SMS_CONSENT_LEGAL_TEXT;
  return (
    <span className="mt-1 block text-xs leading-snug text-muted">
      {body}{" "}
      See our{" "}
      <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>.
    </span>
  );
}

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
          <span>
            <span>{SMS_CONSENT_LABEL}</span>
            <ConsentLegalText />
          </span>
        </label>
        <p className="text-xs text-muted">{SMS_CONSENT_OFF_NOTE}</p>
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
