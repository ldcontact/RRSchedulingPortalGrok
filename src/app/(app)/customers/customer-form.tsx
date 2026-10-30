"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveCustomer } from "./actions";
import type { Customer } from "@/lib/types";

export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action, pending] = useActionState(saveCustomer, undefined);
  const v = (k: keyof Customer | string, fallback = "") =>
    state?.values?.[k] ?? (customer ? String((customer as Record<string, unknown>)[k] ?? "") : fallback);
  return (
    <form action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <label className="label sm:col-span-2">Business name *<input className="input" name="name" required defaultValue={v("name")} placeholder="e.g. Schaumburg Bakery" autoFocus /></label>
      {!customer && (<>
        <label className="label">Primary contact<input className="input" name="contact_name" defaultValue={v("contact_name")} placeholder="Full name" /></label>
        <label className="label">Contact title<input className="input" name="contact_title" defaultValue={v("contact_title")} placeholder="Owner, Office manager…" /></label>
      </>)}
      <label className="label">Phone<input className="input" name="phone" type="tel" defaultValue={v("phone")} placeholder="(847) 555-0123" /></label>
      <label className="label">Email<input className="input" name="email" type="email" defaultValue={v("email")} /></label>
      <label className="label sm:col-span-2">Street address<input className="input" name="address" defaultValue={v("address")} /></label>
      <div className="grid grid-cols-[1fr_80px_110px] gap-3 sm:col-span-2">
        <label className="label">City<input className="input" name="city" defaultValue={v("city")} placeholder="Schaumburg" /></label>
        <label className="label">State<input className="input" name="state" maxLength={2} defaultValue={v("state", "IL")} /></label>
        <label className="label">ZIP<input className="input" name="zip" inputMode="numeric" defaultValue={v("zip")} /></label>
      </div>
      <label className="label sm:col-span-2">Tags (comma separated)<input className="input" name="tags" defaultValue={state?.values?.tags ?? (customer ? customer.tags.join(", ") : "Lead")} /></label>
      <label className="label sm:col-span-2">Notes<textarea className="input min-h-24" name="notes" defaultValue={v("notes")} placeholder="Access, best time to call, decision maker…" /></label>
      {state?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Link href={customer ? `/customers/${customer.id}` : "/customers"} className="btn">Cancel</Link>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : customer ? "Save changes" : "Add customer"}</button>
      </div>
    </form>
  );
}
