import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/ui";

export const metadata: Metadata = { title: "Get started — Retrofit Rebates" };

export default async function GetStartedPage({ searchParams }: PageProps<"/get-started">) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const err = typeof sp.error === "string" ? sp.error : "";
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark className="h-10 w-auto" />
        <div>
          <div className="font-bold">Retrofit Rebates</div>
          <div className="text-sm text-muted">Request a free home assessment</div>
        </div>
      </div>
      {ok ? (
        <div className="card p-6">
          <h1 className="text-xl font-semibold">Thanks — we received your request.</h1>
          <p className="mt-2 text-sm text-muted">A sales rep will follow up. Nothing else is sent automatically from this form.</p>
        </div>
      ) : (
        <form action="/api/sales/leads" method="post" className="card flex flex-col gap-3 p-6">
          <h1 className="text-xl font-semibold">Get started</h1>
          <p className="text-sm text-muted">Tell us how to reach you. A Retrofit Rebates rep will contact you about a Whole Home Electric assessment.</p>
          {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
          <label className="label">Name<input className="input" name="name" required /></label>
          <label className="label">Phone<input className="input" name="phone" type="tel" /></label>
          <label className="label">Email<input className="input" name="email" type="email" /></label>
          <label className="label">Street address<input className="input" name="address" /></label>
          <div className="grid grid-cols-3 gap-2">
            <label className="label col-span-2">City<input className="input" name="city" /></label>
            <label className="label">ZIP<input className="input" name="zip" /></label>
          </div>
          <input type="hidden" name="state" value="IL" />
          <label className="label">How can we help?<textarea className="input min-h-24" name="message" /></label>
          <label className="flex items-start gap-2 text-sm leading-snug">
            <input type="checkbox" name="sms_consent" value="yes" className="mt-1" />
            <span>
              I agree to receive SMS messages from Retrofit Rebates about my assessment, scheduling, and project updates.
              Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.
              Consent is not a condition of service. See our{" "}
              <Link className="text-brand underline" href="/privacy">Privacy Policy</Link>.
            </span>
          </label>
          <p className="text-xs text-muted">Leave the box unchecked if you do not want texts. If you enter a phone number and want SMS, please check the box.</p>
          <button className="btn btn-primary">Send request</button>
        </form>
      )}
    </main>
  );
}
