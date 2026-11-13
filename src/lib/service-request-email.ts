import type { SREvent } from "@/lib/types";
import { dayKey, fmtDay, fmtRange } from "@/lib/time";
import { pickTicketVisit } from "@/lib/tickets";

/** Public contact lines used at the bottom of customer schedule emails. */
export const COMPANY_NAME = "Retrofit Rebates, Inc.";
export const COMPANY_ADDRESS = "507 Estes Ave, Schaumburg, IL 60193";
export const COMPANY_PHONE = "773-362-5003";
export const COMPANY_EMAIL = "luke@retrofitrebates.com";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ScheduleVisitLike = {
  job_id?: string;
  id?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  assignees?: { full_name: string }[];
};

export type ScheduleEmailDraftInput = {
  customerName: string;
  contactName: string | null;
  startsAt: string;
  endsAt: string;
  address: string;
  techNames: string[];
  ticketNumber: string;
};

export type ScheduleEmailDraft = {
  to: string;
  cc: string[];
  subject: string;
  body: string;
};

/** Split a To/CC field into unique, lowercased addresses (order preserved). */
export function parseEmailList(raw: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function invalidEmails(list: string[]): string[] {
  return list.filter((e) => !isValidEmail(e));
}

/** Next upcoming live visit, or the latest non-cancelled visit. */
export function pickScheduleVisit<T extends ScheduleVisitLike>(visits: T[]): T | null {
  return pickTicketVisit(
    visits.map((v) => ({ ...v, job_id: v.job_id || v.id || "" })),
  );
}

/** Why the Send schedule email button is disabled, or null when it can send. */
export function scheduleEmailBlockers(opts: {
  visit: { starts_at: string; status: string } | null;
  customerEmail: string | null | undefined;
}): string | null {
  const email = (opts.customerEmail ?? "").trim();
  const hasVisit = !!opts.visit && opts.visit.status !== "cancelled" && !!opts.visit.starts_at;
  const hasEmail = isValidEmail(email);
  if (!hasVisit && !hasEmail) return "Schedule a visit and add a customer email first.";
  if (!hasVisit) return "Schedule a visit first.";
  if (!hasEmail) return "Add a customer email to send this.";
  return null;
}

export function lastScheduleEmailEvent<T extends Pick<SREvent, "kind" | "created_at">>(events: T[]): T | null {
  return events
    .filter((e) => e.kind === "emailed")
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function formatScheduleEmailEventBody(to: string, cc: string[]): string {
  const ccPart = cc.length ? ` (cc ${cc.join(", ")})` : "";
  return `Schedule email sent to ${to}${ccPart}.`;
}

export function formatVisitDate(startsAt: string): string {
  return fmtDay(dayKey(startsAt), { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function scheduleEmailSubject(startsAt: string): string {
  return `Your Retrofit Rebates service visit is scheduled for ${formatVisitDate(startsAt)}`;
}

function greetingName(contactName: string | null, customerName: string): string {
  const raw = (contactName ?? "").trim() || customerName.trim();
  if (!raw) return "there";
  return raw.split(/\s+/)[0];
}

export function scheduleEmailBody(input: ScheduleEmailDraftInput): string {
  const name = greetingName(input.contactName, input.customerName);
  const date = formatVisitDate(input.startsAt);
  const window = fmtRange(input.startsAt, input.endsAt);
  const techs = input.techNames.map((n) => n.trim()).filter(Boolean).join(", ") || "To be assigned";
  const address = input.address.trim() || "See your service address on file.";
  return [
    `Hi ${name},`,
    "",
    `Your Retrofit Rebates service visit is scheduled for ${date}, ${window}.`,
    "",
    "Service address:",
    address,
    "",
    "Assigned technician:",
    techs,
    "",
    `Ticket: ${input.ticketNumber}`,
    "",
    `If you have questions or need to reschedule, call us at ${COMPANY_PHONE} or email ${COMPANY_EMAIL}.`,
    "",
    "Thank you,",
    COMPANY_NAME,
    COMPANY_ADDRESS,
    COMPANY_PHONE,
    COMPANY_EMAIL,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Simple HTML twin of the editable plain-text body. */
export function scheduleEmailHtml(text: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c2423">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#134e4a;color:#fff;padding:16px 20px;font-weight:700;font-size:15px">Retrofit Rebates</div>
    <div style="padding:20px;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(text)}</div>
  </div>
</body></html>`;
}

export function buildScheduleEmailDraft(opts: {
  customerEmail: string;
  creatorEmail?: string | null;
  customerName: string;
  contactName: string | null;
  visit: { starts_at: string; ends_at: string; assignees?: { full_name: string }[] };
  address: string;
  ticketNumber: string;
}): ScheduleEmailDraft {
  const to = opts.customerEmail.trim().toLowerCase();
  const creator = (opts.creatorEmail ?? "").trim().toLowerCase();
  const cc = creator && creator !== to && isValidEmail(creator) ? [creator] : [];
  return {
    to,
    cc,
    subject: scheduleEmailSubject(opts.visit.starts_at),
    body: scheduleEmailBody({
      customerName: opts.customerName,
      contactName: opts.contactName,
      startsAt: opts.visit.starts_at,
      endsAt: opts.visit.ends_at,
      address: opts.address,
      techNames: (opts.visit.assignees ?? []).map((a) => a.full_name),
      ticketNumber: opts.ticketNumber,
    }),
  };
}
