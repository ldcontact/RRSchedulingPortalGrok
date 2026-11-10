import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader } from "@/components/ui";
import { ChannelIcon, SRStatusPill, WarrantyPill } from "@/components/status";
import { Modal } from "@/components/modal";
import { Pager, pageParam } from "@/components/pager";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { formatAddress, ageText } from "@/lib/project-row";
import { fmtMonthYear, fmtReceived, localInput } from "@/lib/tickets";
import { PAGE_SIZE, SR_CHANNEL_LABEL, SR_STATUSES, SR_STATUS_LABEL, WARRANTY_LABEL, ticketNo, type SRChannel, type SRPageFilter, type SRStatus, type WarrantyState } from "@/lib/types";
import { LogCallForm } from "./log-call-form";

export const metadata: Metadata = { title: "Service requests" };

const TABS: { key: SRPageFilter["status"]; label: string }[] = [
  { key: "open", label: "All open" }, ...SR_STATUSES.map((st) => ({ key: st, label: SR_STATUS_LABEL[st] })), { key: "all", label: "All" },
];

export default async function ServiceRequestsPage({ searchParams }: PageProps<"/service-requests">) {
  const user = await requireRole("admin", "manager");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const status: SRPageFilter["status"] = str("status") === "all" ? "all" : SR_STATUSES.includes(str("status") as SRStatus) ? (str("status") as SRStatus) : "open";
  const channel = (["call", "email", "other"] as SRChannel[]).find((c) => c === str("channel"));
  const warranty = (["in", "out", "unknown"] as WarrantyState[]).find((w) => w === str("warranty"));
  const assignee = str("assignee") === "me" ? user.id : str("assignee") || undefined;
  const q = str("q");
  const repo = await getRepo();
  const [{ items, total, page, size, counts }, people] = await Promise.all([
    repo.pageServiceRequests({ q, status, channel, warranty, assignee, page: pageParam(sp.page), size: PAGE_SIZE }),
    repo.listAssignable(),
  ]);
  const staffPeople = people.filter((p) => p.role === "admin" || p.role === "manager");
  const keep = { ...(q ? { q } : {}), ...(channel ? { channel } : {}), ...(warranty ? { warranty } : {}), ...(str("assignee") ? { assignee: str("assignee") } : {}) };
  const qs = (st: SRPageFilter["status"], p = 1, extra: Record<string, string> = {}) => `${new URLSearchParams({ ...(st && st !== "open" ? { status: st } : {}), ...keep, ...(p > 1 ? { page: String(p) } : {}), ...extra })}`;
  const href = (st: SRPageFilter["status"], p = 1) => `/service-requests${qs(st, p) ? `?${qs(st, p)}` : ""}`;
  const here = href(status, page);
  const newHref = `/service-requests?${qs(status, page, { new: "1" })}`;
  const showNew = str("new") === "1";
  const error = str("error");
  const filtered = !!(q || channel || warranty || assignee);
  return (
    <>
      <PageHeader title="Service requests"
        sub={`${(counts.open ?? 0).toLocaleString("en-US")} open · ${(counts.new ?? 0).toLocaleString("en-US")} new · tickets stay off the Projects list until they are converted`}
        actions={<Link href={newHref} scroll={false} className="btn btn-primary" data-testid="new-request"><Icon name="plus" />New request</Link>} />
      {error && <div className="mb-3"><Banner tone="error"><Icon name="alert" />{error}</Banner></div>}
      <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Filter by status">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} role="tab" aria-selected={status === t.key}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${status === t.key ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink"}`}>
            {t.label}<span className={`rounded-full px-1.5 text-[11px] ${status === t.key ? "bg-white/20" : "bg-canvas"}`}>{(counts[t.key ?? "open"] ?? 0).toLocaleString("en-US")}</span>
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {status !== "open" && <input type="hidden" name="status" value={status} />}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-line bg-white px-3 sm:basis-auto sm:max-w-sm">
          <Icon name="search" className="size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search ticket, customer, site, issue…" className="w-full bg-transparent py-2 text-sm outline-none" type="search" aria-label="Search service requests" />
        </div>
        <select name="channel" defaultValue={channel ?? ""} className="input w-auto" aria-label="Channel">
          <option value="">Channel: All</option>{(["call", "email", "other"] as SRChannel[]).map((c) => <option key={c} value={c}>{SR_CHANNEL_LABEL[c]}</option>)}
        </select>
        <select name="warranty" defaultValue={warranty ?? ""} className="input w-auto" aria-label="Warranty">
          <option value="">Warranty: All</option>{(["in", "out", "unknown"] as WarrantyState[]).map((w) => <option key={w} value={w}>{WARRANTY_LABEL[w]}</option>)}
        </select>
        <select name="assignee" defaultValue={str("assignee")} className="input w-auto" aria-label="Assignee">
          <option value="">Assignee: Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
          {staffPeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <button className="btn">Apply</button>
        {filtered && <Link href={href(status)} className="btn">Clear</Link>}
      </form>
      <div className="card divide-y divide-line" data-testid="ticket-list">
        {items.length === 0 && <div className="p-8 text-center text-muted">{filtered ? "No service requests match these filters." : status === "open" ? "No open service requests. Log a call with New request." : "Nothing here."}</div>}
        {items.map((t) => (
          <Link key={t.id} href={`/service-requests/${t.id}`} data-testid="ticket-row"
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-[#fafbf9] sm:px-5 xl:grid-cols-[70px_minmax(0,1.6fr)_minmax(0,1.3fr)_150px_130px_96px_32px_16px]">
            <div className="font-bold text-[13px]">{ticketNo(t.number)}</div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{t.customer_name}</div>
              <div className="truncate text-[12.5px] text-muted">{formatAddress({ address: t.site_address, city: t.site_city }) || "No site address"}</div>
              <div className="line-clamp-2 text-[12.5px] text-ink/80">{t.summary}</div>
            </div>
            <div className="justify-self-end xl:hidden"><SRStatusPill status={t.status} /></div>
            <div className="col-span-3 min-w-0 text-[12.5px] xl:col-span-1">
              {t.project_id ? <>
                <div className="truncate font-semibold">{t.project_name}</div>
                <div className="truncate text-muted">{t.project_completed_at ? `Completed ${fmtMonthYear(t.project_completed_at)} · ${ageText(t.project_completed_at)} ago` : "Original project not finished"}</div>
              </> : <><div className="text-muted">No project linked</div><div className="text-muted">Match a past job, or convert if it is new work</div></>}
            </div>
            <div className="col-span-3 flex items-center gap-2 text-[12.5px] text-muted xl:col-span-1"><ChannelIcon channel={t.channel} />{fmtReceived(t.received_at)}
              <span className="ml-auto xl:hidden"><WarrantyPill state={t.warranty_state} /></span></div>
            <div className="hidden xl:block"><WarrantyPill state={t.warranty_state} /></div>
            <div className="hidden xl:block"><SRStatusPill status={t.status} /></div>
            <div className="hidden xl:block">{t.assignee_id ? <Avatar name={t.assignee_name ?? "?"} color={t.assignee_color ?? "#64748b"} size="sm" /> : <span className="text-muted">—</span>}</div>
            <Icon name="right" className="hidden size-4 text-muted xl:block" />
          </Link>
        ))}
      </div>
      <Pager page={page} size={size} total={total} href={(p) => href(status, p)} label="Service requests" />
      {showNew && (
        <Modal title="Log a call" sub="Creates a service request · nothing is sent to the customer" closeHref={here}>
          <LogCallForm cancelHref={here} now={localInput(new Date().toISOString())} />
        </Modal>
      )}
    </>
  );
}
