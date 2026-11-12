import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/ui";
import { getSalesRepo } from "@/lib/sales/repo";
import { SignForm } from "./sign-form";

export const metadata: Metadata = { title: "Sign proposal" };

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function SignPage({ params }: PageProps<"/sign/[token]">) {
  const { token } = await params;
  const repo = await getSalesRepo();
  const proposal = await repo.getProposalByToken(token);
  if (!proposal) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark className="h-10 w-auto" />
        <div>
          <div className="font-bold">Retrofit Rebates</div>
          <div className="text-sm text-muted">Proposal signature</div>
        </div>
      </div>
      <div className="card p-6">
        <h1 className="text-xl font-semibold">{proposal.title}</h1>
        <p className="mt-1 text-sm text-muted">For {proposal.deal_title}. Signing moves the deal to Approved - Ready to Schedule.</p>
        <ul className="mt-4 divide-y divide-line text-sm">
          {proposal.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2"><span>{i.label}</span><span className="font-medium">{money(i.amount)}</span></li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between font-bold"><span>Net</span><span>{money(proposal.net)}</span></div>
        {proposal.notes && <p className="mt-3 text-xs text-muted">{proposal.notes}</p>}
        {proposal.status === "signed" ? (
          <p className="mt-4 text-sm">Signed by {proposal.signer_name} on {proposal.signed_at ? new Date(proposal.signed_at).toLocaleString("en-US", { timeZone: "America/Chicago" }) : ""}. This is your electronic signature record.</p>
        ) : (
          <SignForm token={token} />
        )}
      </div>
    </main>
  );
}
