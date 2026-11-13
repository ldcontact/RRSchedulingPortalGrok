"use client";
import { useActionState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { DealContactFields } from "@/components/sales/deal-contact-fields";
import { PIPELINE_DEFS } from "@/lib/sales/catalog";
import { createDealAction } from "../../actions";

export default function NewDealPage() {
  const [state, action] = useActionState(createDealAction, undefined);
  return (
    <>
      <PageHeader title="New deal" back={{ href: "/sales", label: "Sales" }} />
      <form action={action} className="card flex max-w-lg flex-col gap-3 p-4">
        <label className="label">Program
          <select className="input" name="pipeline_slug" defaultValue="single_family_whe">
            {PIPELINE_DEFS.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        <DealContactFields />
        {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
        <div className="flex gap-2">
          <SubmitButton className="btn btn-primary" pendingText="Creating…">Create deal</SubmitButton>
          <Link href="/sales" className="btn">Cancel</Link>
        </div>
      </form>
    </>
  );
}
