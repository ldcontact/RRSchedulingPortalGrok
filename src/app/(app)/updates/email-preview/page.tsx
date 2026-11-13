import { notFound } from "next/navigation";
import { MOCK_MODE } from "@/lib/env";
import { requireMember } from "@/lib/auth";
import { getUpdatesRepo } from "@/lib/updates/repo";
import { buildUpdateEmail } from "@/lib/updates/email";

export const metadata = { title: "Update email preview" };

/** Mock-only draft render. Nothing is sent. */
export default async function UpdateEmailPreviewPage() {
  if (!MOCK_MODE) notFound();
  await requireMember();
  const repo = await getUpdatesRepo();
  const drafts = await repo.listEmailDrafts();
  const fallback = buildUpdateEmail({
    actorName: "Ronan O'Connor",
    contextTitle: "Karla Gonzalez",
    kind: "mention",
    body: "Aaron, can we confirm the attic baffles before we schedule?",
    link: "/sales/deals/mon-11633298670#update-demo",
    postedAt: "2026-07-23T18:49:08.000Z",
  });
  const draft = drafts[0];
  const html = draft?.html ?? fallback.html;
  const to = draft?.to ?? "aaron@retrofitrebates.com";
  const subject = draft?.subject ?? fallback.subject;
  return (
    <div className="mx-auto max-w-2xl" data-testid="update-email-preview">
      <h1 className="mb-1 text-xl font-semibold">Notification email draft</h1>
      <p className="mb-4 text-sm text-muted">Render only — nothing was sent. Staff addresses only.</p>
      <div className="mb-4 rounded-lg border border-line bg-white p-3 text-sm">
        <div><span className="text-muted">To:</span> {to}</div>
        <div><span className="text-muted">Subject:</span> {subject}</div>
      </div>
      <iframe title="Email draft" className="h-[640px] w-full rounded-xl border border-line bg-[#f4f1ea]" srcDoc={html} />
    </div>
  );
}
