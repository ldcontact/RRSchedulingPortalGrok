import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { requireSales } from "@/lib/auth";
import { summarizeDeal } from "@/lib/sales/ai";
import { pipelineBySlug, stageBySlug } from "@/lib/sales/catalog";
import { canOfferConvert } from "@/lib/sales/convert";
import { canDeleteSalesRecord } from "@/lib/sales/permissions";
import { getSalesRepo } from "@/lib/sales/repo";
import { smsEnabled } from "@/lib/sales/sms";
import { dealLengthDays } from "@/lib/sales/types";
import { convertDealAction, createBookingLinkAction, deleteDealAction, draftMessage, moveDealStage, saveAiFollowUpDraft, saveDealNote, sendDraftAction, sendProposalAction } from "../../actions";
import { UpdatesPanel } from "@/components/updates/updates-panel";
import { getUpdatesRepo } from "@/lib/updates/repo";

export const metadata: Metadata = { title: "Deal" };

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function DealPage({ params, searchParams }: PageProps<"/sales/deals/[id]">) {
  const user = await requireSales();
  const { id } = await params;
  const sp = await searchParams;
  const repo = await getSalesRepo();
  const deal = await repo.getDeal(id);
  if (!deal) notFound();
  const updatesRepo = await getUpdatesRepo();
  const [activities, proposals, directory, threads, mentionable] = await Promise.all([
    repo.listActivities(deal.id),
    repo.listProposals(deal.id),
    repo.ownerDirectory(),
    updatesRepo.listForDeal(deal.id),
    updatesRepo.mentionableUsers(),
  ]);
  const brief = await summarizeDeal(deal, activities);
  const pipe = pipelineBySlug(deal.pipeline_slug);
  const stages = pipe?.stages ?? [];
  const canDelete = canDeleteSalesRecord(user);
  const bookingBase = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <>
      <PageHeader
        back={{ href: "/sales", label: "Sales" }}
        title={deal.title}
        sub={`${deal.contact_name ?? "No contact"} · ${[deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(", ")}`}
        actions={canDelete ? (
          <form action={deleteDealAction.bind(null, deal.id)}><button className="btn" data-testid="delete-deal">Delete</button></form>
        ) : undefined}
      />
      {typeof sp.ok === "string" && sp.ok && <div className="mb-3"><Banner tone="ok">{sp.ok}</Banner></div>}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {stages.map((s) => {
          const on = s.slug === deal.stage_slug;
          return (
            <form key={s.slug} action={moveDealStage.bind(null, deal.id, s.slug)}>
              <button className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${on ? "border-transparent text-white" : "border-line bg-white text-muted hover:border-brand"}`} style={on ? { background: s.color } : undefined}>{s.name}</button>
            </form>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-semibold">AI summary & next step</div>
              <span className="pill bg-canvas text-muted">{brief.disabled ? "Disabled" : brief.provider}</span>
            </div>
            {brief.disabled ? (
              <p className="text-sm text-muted">{brief.reason ?? "AI summaries are unavailable in this environment."}</p>
            ) : (
              <>
                <p className="text-sm">{brief.result.summary}</p>
                <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">Next: {brief.result.nextStep}</div>
                <div className="mt-3 rounded-lg border border-dashed border-line p-3">
                  <div className="text-xs font-semibold uppercase text-muted">Suggested follow-up (draft only — not sent)</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{brief.result.followUp.body}</p>
                  <form action={saveAiFollowUpDraft.bind(null, deal.id)} className="mt-2">
                    <input type="hidden" name="channel" value={brief.result.followUp.channel} />
                    <input type="hidden" name="body" value={brief.result.followUp.body} />
                    <input type="hidden" name="to" value={(brief.result.followUp.channel === "sms" ? deal.contact_phone : deal.contact_email) ?? ""} />
                    <button className="btn">Save {brief.result.followUp.channel.toUpperCase()} draft</button>
                  </form>
                </div>
              </>
            )}
          </div>

          <UpdatesPanel
            dealId={deal.id}
            projectId={deal.converted_project_id}
            contextTitle={deal.title}
            threads={threads}
            users={mentionable}
            user={user}
          />

          <div className="card p-4">
            <div className="mb-3 font-semibold">Conversation</div>
            <p className="mb-3 text-xs text-muted">Outgoing email uses the existing Gmail setup when a rep clicks Send. SMS is wired to Twilio but stays off until A2P 10DLC registration is approved. Nothing auto-sends to the customer.</p>
            <form action={draftMessage.bind(null, deal.id)} className="mb-4 grid gap-2 rounded-lg border border-dashed border-line p-3">
              <div className="flex flex-wrap gap-3">
                <label className="text-sm font-semibold"><input type="radio" name="kind" value="email" defaultChecked className="mr-1" />Email draft</label>
                <label className="text-sm font-semibold"><input type="radio" name="kind" value="sms" className="mr-1" />SMS draft{!smsEnabled() ? " (provider off)" : ""}</label>
              </div>
              <input className="input" name="to" defaultValue={deal.contact_email ?? deal.contact_phone ?? ""} placeholder="To" />
              <input className="input" name="subject" placeholder="Subject (email)" defaultValue="" />
              <textarea className="input min-h-24" name="body" required placeholder="Write the message. It is saved as a draft." />
              <button className="btn btn-primary justify-self-start">Save draft</button>
            </form>
            <form action={saveDealNote.bind(null, deal.id)} className="mb-4 flex gap-2">
              <input className="input" name="body" placeholder="Add an internal note" />
              <button className="btn">Note</button>
            </form>
            <ol className="flex flex-col gap-3">
              {activities.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
              {activities.map((a) => (
                <li key={a.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-muted">
                    <span>{a.kind}</span>
                    <span>{a.direction}</span>
                    <span className={a.status === "draft" ? "text-amber-700" : ""}>{a.status}</span>
                    <span className="ml-auto font-normal normal-case">{new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}</span>
                  </div>
                  {a.subject && <div className="mt-1 font-semibold">{a.subject}</div>}
                  <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
                  {a.status === "draft" && (a.kind === "email" || a.kind === "sms") && (
                    <form action={sendDraftAction.bind(null, a.id, deal.id)} className="mt-2">
                      <button className="btn btn-primary"><Icon name="send" />Send</button>
                    </form>
                  )}
                  {a.meta && typeof a.meta === "object" && "skip_reason" in a.meta && (
                    <p className="mt-1 text-xs text-amber-800">{String((a.meta as { skip_reason?: string }).skip_reason)}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="card p-4">
            <div className="mb-3 font-semibold">Proposal</div>
            {proposals.length === 0 && <p className="text-sm text-muted">No proposal on this deal yet.</p>}
            {proposals.map((p) => (
              <div key={p.id} className="mb-3 rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm text-muted">{p.status}{p.signed_at ? ` · signed by ${p.signer_name}` : ""}</div>
                  </div>
                  <div className="font-bold">{money(p.net)}</div>
                </div>
                <ul className="mt-2 text-sm">
                  {p.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span>{i.label}</span><span>{money(i.amount)}</span></li>)}
                </ul>
                {p.status !== "signed" && p.status !== "void" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={sendProposalAction.bind(null, p.id, deal.id)}><button className="btn">Mark sent</button></form>
                    {p.public_token && <Link className="btn btn-primary" href={`/sign/${p.public_token}`}>Open signing page</Link>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card p-4 text-sm">
            <div className="mb-2 font-semibold">Details</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted">Owner</dt>
              <dd className="inline-flex min-w-0 items-center gap-1.5">
                {deal.owner_id ? (
                  <>
                    <Avatar
                      name={directory[deal.owner_id]?.name ?? deal.owner_id}
                      color={directory[deal.owner_id]?.color ?? "#0f766e"}
                      size="sm"
                      src={directory[deal.owner_id]?.avatar_url}
                    />
                    <span className="truncate">{directory[deal.owner_id]?.name ?? deal.owner_id}</span>
                  </>
                ) : "Unassigned"}
              </dd>
              <dt className="text-muted">Priority</dt><dd>{deal.priority}</dd>
              <dt className="text-muted">Source</dt><dd>{deal.source.replaceAll("_", " ")}</dd>
              <dt className="text-muted">Value</dt><dd>{deal.value ? money(deal.value) : "—"}</dd>
              <dt className="text-muted">Est. rebate</dt><dd>{deal.est_rebate ? money(deal.est_rebate) : "—"}</dd>
              <dt className="text-muted">Open</dt><dd>{dealLengthDays(deal)} days</dd>
              <dt className="text-muted">Assessment</dt><dd>{deal.assessment_date ?? "—"}</dd>
              <dt className="text-muted">Phone</dt><dd>{deal.contact_phone ?? "—"}</dd>
              <dt className="text-muted">Email</dt><dd className="truncate">{deal.contact_email ?? "—"}</dd>
            </dl>
            {deal.notes && <p className="mt-3 text-muted">{deal.notes}</p>}
            {deal.customer_id && <Link href={`/customers/${deal.customer_id}`} className="mt-3 inline-flex text-sm font-semibold text-brand">Open customer</Link>}
          </div>

          <div className="card p-4">
            <div className="mb-2 font-semibold">Self-booking link</div>
            <p className="mb-2 text-xs text-muted">Customers pick an assessment time from real schedule availability. Confirmation texts stay in draft.</p>
            <form action={async () => {
              "use server";
              const token = await createBookingLinkAction(deal.id);
              const { redirect } = await import("next/navigation");
              redirect(`/sales/deals/${deal.id}?ok=${encodeURIComponent("Booking link created: /book/" + token)}`);
            }}>
              <button className="btn">Create booking link</button>
            </form>
            <div className="mt-2 text-xs text-muted">Demo link for Nora Patel: <Link className="text-brand" href="/book/demo-book-nora">/book/demo-book-nora</Link>{bookingBase ? "" : ""}</div>
          </div>

          <div className="card p-4">
            <div className="mb-2 font-semibold">Convert to a Project</div>
            {deal.converted_project_id ? (
              <Link href={`/projects/${deal.converted_project_id}`} className="btn btn-primary">Open Project</Link>
            ) : canOfferConvert(deal) ? (
              <form action={convertDealAction.bind(null, deal.id)} className="flex flex-col gap-2">
                <p className="text-xs text-muted">Creates a Project from this deal. Optional first visit times (ISO).</p>
                <input className="input" name="starts_at" placeholder="Visit start (optional)" />
                <input className="input" name="ends_at" placeholder="Visit end (optional)" />
                <button className="btn btn-primary">Convert to Project</button>
              </form>
            ) : (
              <p className="text-sm text-muted">Move the deal to Approved - Ready to Schedule (or sign the proposal) before converting.</p>
            )}
          </div>
        </aside>
      </div>
      <span className="sr-only">{stageBySlug(deal.pipeline_slug, deal.stage_slug)?.name}</span>
    </>
  );
}
