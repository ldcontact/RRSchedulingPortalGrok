"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { DealContactFields } from "@/components/sales/deal-contact-fields";
import type { SalesDeal } from "@/lib/sales/types";
import { updateDealDetailsAction } from "@/app/(app)/sales/actions";

export function DealDetailsForm({ deal, consentNote }: { deal: SalesDeal; consentNote?: string | null }) {
  const [state, action] = useActionState(updateDealDetailsAction.bind(null, deal.id), undefined);
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <div className="font-semibold">Contact & address</div>
      <DealContactFields deal={deal} consentNote={consentNote} />
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      {state?.ok && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{state.ok}</div>}
      <div>
        <SubmitButton className="btn btn-primary" pendingText="Saving…">Save contact</SubmitButton>
      </div>
    </form>
  );
}
