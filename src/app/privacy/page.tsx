import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy Policy — Retrofit Rebates" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark className="h-10 w-auto" />
        <div>
          <div className="font-bold">Retrofit Rebates</div>
          <div className="text-sm text-muted">Privacy Policy & SMS terms</div>
        </div>
      </div>
      <article className="card flex flex-col gap-4 p-6 text-sm leading-relaxed">
        <h1 className="text-xl font-semibold">Privacy Policy</h1>
        <p className="text-muted">Last updated November 12, 2026. This page is the portal copy. The same wording should also be posted on retrofitrebates.com.</p>
        <p>
          Retrofit Rebates, Inc. (“we,” “us”) at 507 Estes Ave, Schaumburg, IL 60193 collects the information you give us
          when you request an assessment or work with us on an energy-efficiency project — including your name, address,
          phone number, email, and project details. We use this information to follow up, schedule assessments, complete
          projects, and process utility rebate paperwork.
        </p>
        <h2 className="text-base font-semibold">SMS / text messages</h2>
        <p>
          If you opt in, we may send SMS messages about your inquiry, assessment scheduling, project updates, and related
          customer care. Message frequency varies. Message and data rates may apply. You can opt out at any time by
          replying STOP. Reply HELP for help, or contact us at 773-362-5003 or luke@retrofitrebates.com.
          Consent to receive texts is not a condition of purchase or service.
        </p>
        <p>
          We do not sell your phone number or SMS opt-in information to third parties. Carriers are not liable for delayed
          or undelivered messages. We retain inquiry and project records as needed to provide service and meet utility
          program requirements, then delete or anonymize them when they are no longer needed.
        </p>
        <p>
          To request access, correction, or deletion of your information, email luke@retrofitrebates.com or write to
          Retrofit Rebates, Inc., 507 Estes Ave, Schaumburg, IL 60193.
        </p>
        <p><Link className="text-brand underline" href="/get-started">Back to Get started</Link></p>
      </article>
    </main>
  );
}
