import type { Metadata } from "next";
import { BrandMark } from "@/components/ui";

export const metadata: Metadata = { title: "Get started — Retrofit Rebates" };

export default async function GetStartedPage({ searchParams }: PageProps<"/get-started">) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
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
          <button className="btn btn-primary">Send request</button>
        </form>
      )}
    </main>
  );
}
