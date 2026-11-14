import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/ui";

export const metadata: Metadata = { title: "Terms of Use — Retrofit Rebates" };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark className="h-10 w-auto" />
        <div>
          <div className="font-bold">Retrofit Rebates</div>
          <div className="text-sm text-muted">Terms of Use &amp; end-user license</div>
        </div>
      </div>
      <article className="card flex flex-col gap-4 p-6 text-sm leading-relaxed">
        <h1 className="text-xl font-semibold">Terms of Use</h1>
        <p className="text-muted">
          Effective November 13, 2026. These terms are the end-user license agreement for RR Scheduler.
        </p>

        <h2 className="text-base font-semibold">1. About RR Scheduler</h2>
        <p>
          RR Scheduler is an internal field-service portal operated by Retrofit Rebates, Inc. (“we,” “us”)
          at 507 Estes Ave, Schaumburg, IL 60193. It is for Retrofit Rebates staff and people we invite.
          These terms govern your use of the portal (the “Service”). By signing in or using the Service,
          you agree to these terms.
        </p>

        <h2 className="text-base font-semibold">2. License to use the Service</h2>
        <p>
          We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the
          Service solely for Retrofit Rebates work, for as long as your account is active. You may not copy,
          modify, sell, sublicense, or provide the Service to others, or use it for any purpose other than
          your work with us.
        </p>

        <h2 className="text-base font-semibold">3. Accounts and acceptable use</h2>
        <p>
          You must keep your login credentials confidential and use only the account we issued or invited
          you to. You are responsible for activity under your account. Do not share your password, attempt
          to access anyone else’s account, disrupt the Service, misuse customer or project data, or use the
          Service for anything unlawful. Tell us promptly if you think your account has been compromised.
        </p>

        <h2 className="text-base font-semibold">4. Third-party integrations, including QuickBooks Online</h2>
        <p>
          The Service may connect to third-party services, including Intuit QuickBooks Online, so we can
          create and manage invoices. If a QuickBooks company is connected:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            We share with Intuit only the data needed to create and manage invoices — for example, customer
            names and addresses, contact details, invoice line items, amounts, and related project or
            service-request information.
          </li>
          <li>
            You can disconnect QuickBooks at any time from Settings → Integrations. Disconnecting stops
            further sharing; it does not delete invoices or customers already created in QuickBooks.
          </li>
          <li>
            Your use of QuickBooks is also subject to Intuit’s own terms and privacy policy. We are not
            responsible for Intuit’s service.
          </li>
        </ul>
        <p>
          Other integrations we enable (for example, mapping, email, or texting providers) receive only
          what they need to perform that function, and their own terms apply.
        </p>

        <h2 className="text-base font-semibold">5. Customer data</h2>
        <p>
          The Service stores customer and project information so our team can schedule work, complete
          projects, and process invoices and rebate paperwork. You may only use that information for
          Retrofit Rebates work. How we collect, use, and share personal information is described in our{" "}
          <Link className="text-brand underline" href="/privacy">Privacy Policy</Link>.
        </p>

        <h2 className="text-base font-semibold">6. Texting consent</h2>
        <p>
          If a customer agrees to receive text messages, we may send SMS about their inquiry, scheduling,
          project updates, and related customer care. Message frequency varies. Message and data rates may
          apply. Customers can opt out by replying STOP. Consent to texts is not a condition of service.
          Details, including how to get help and how we handle phone numbers, are in our{" "}
          <Link className="text-brand underline" href="/privacy">Privacy Policy</Link>.
        </p>

        <h2 className="text-base font-semibold">7. No warranty</h2>
        <p>
          The Service is provided “as is” and “as available.” We do not warrant that it will be uninterrupted,
          error-free, or free of harmful components. To the fullest extent permitted by law, we disclaim all
          warranties, express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>

        <h2 className="text-base font-semibold">8. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Retrofit Rebates, Inc. is not liable for any indirect,
          incidental, special, consequential, or punitive damages, or for lost profits, data, or goodwill,
          arising from your use of the Service. Our total liability for any claim relating to the Service is
          limited to one hundred dollars ($100), or, if you paid us fees specifically for the Service in the
          twelve months before the claim, the amount of those fees — whichever is greater.
        </p>

        <h2 className="text-base font-semibold">9. Termination</h2>
        <p>
          We may suspend or end your access at any time, including if you leave the company, your invitation
          is withdrawn, or you violate these terms. You may stop using the Service at any time. Provisions
          that should survive — including the license restrictions, no-warranty and limitation-of-liability
          sections, and governing law — will survive termination.
        </p>

        <h2 className="text-base font-semibold">10. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. We will post the updated terms on this page and change
          the effective date. Continued use of the Service after the updated terms are posted means you
          accept the changes. If you do not agree, stop using the Service and contact us.
        </p>

        <h2 className="text-base font-semibold">11. Governing law</h2>
        <p>
          These terms are governed by the laws of the State of Illinois, without regard to conflict-of-law
          rules. Any dispute will be resolved in the state or federal courts located in Illinois.
        </p>

        <h2 className="text-base font-semibold">12. Contact</h2>
        <p>
          Questions about these terms: email{" "}
          <a className="text-brand underline" href="mailto:luke@retrofitrebates.com">luke@retrofitrebates.com</a>
          {" "}or write to Retrofit Rebates, Inc., 507 Estes Ave, Schaumburg, IL 60193.
        </p>

        <p>
          <Link className="text-brand underline" href="/privacy">Privacy Policy</Link>
          {" · "}
          <Link className="text-brand underline" href="/login">Sign in</Link>
        </p>
      </article>
    </main>
  );
}
