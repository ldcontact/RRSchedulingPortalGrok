import type { JobKind, SREvent } from "@/lib/types";
import { DEFAULT_WARRANTY_MONTHS } from "@/lib/types";
import { dayKey, fmtDay, fmtRange } from "@/lib/time";
import { pickTicketVisit } from "@/lib/tickets";

/** Public contact lines used at the bottom of customer schedule emails. */
export const COMPANY_NAME = "Retrofit Rebates, Inc.";
export const COMPANY_ADDRESS = "507 Estes Ave, Schaumburg, IL 60193";
export const COMPANY_PHONE = "773-362-5003";
export const COMPANY_EMAIL = "luke@retrofitrebates.com";
export const TEAM_SIGNOFF = "The Retrofit Rebates Team";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ScheduleVisitLike = {
  job_id?: string;
  id?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  title?: string | null;
  instructions?: string | null;
  notes?: string | null;
  kind?: JobKind;
  assignees?: { full_name: string }[];
};

export type ScheduleEmailDraftInput = {
  customerName: string;
  contactName: string | null;
  startsAt: string;
  endsAt: string;
  address: string;
  techNames: string[];
  ticketNumber?: string;
  visitTitle?: string | null;
  visitNotes?: string | null;
  ticketDescription?: string | null;
  isWarranty?: boolean;
  warrantyMonths?: number | null;
  projectName?: string | null;
  projectTypeLabel?: string | null;
  /** Empty string omits the phone. Null/undefined uses COMPANY_PHONE. */
  companyPhone?: string | null;
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
  const contact = (contactName ?? "").trim();
  if (contact) return contact.split(/\s+/)[0];
  const customer = customerName.trim();
  // A single token (e.g. "Acme") can stand in as a greeting; a company name cannot.
  if (customer && !/\s/.test(customer)) return customer;
  return "there";
}

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Drop the "Warranty —" / "Service —" prefix so the kind is not repeated. */
export function cleanVisitTitle(title: string | null | undefined): string {
  const raw = (title ?? "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/^(warranty|service)\s*[—–:\-]\s*/i, "").trim() || raw;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** Keep customer-facing visit notes; skip photo/checklist instructions for the crew. */
export function customerFacingNotes(notes: string | null | undefined): string {
  const raw = (notes ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((s) => !/^(photos?|take a photos?|take photos?|upload|attach|document each)\b/i.test(s.trim()));
  return kept.join(" ").trim();
}

/** Friendly length of the arrival window, or null when it cannot be measured. */
export function formatVisitDuration(startsAt: string, endsAt: string): string | null {
  const ms = Date.parse(endsAt) - Date.parse(startsAt);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return null;
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return hours === 1 ? "about 1 hour" : `about ${hours} hours`;
  const hPart = hours === 1 ? "1 hour" : `${hours} hours`;
  const mPart = rem === 1 ? "1 minute" : `${rem} minutes`;
  return `about ${hPart} and ${mPart}`;
}

function coverageSentence(input: ScheduleEmailDraftInput): string {
  const program = (input.projectTypeLabel ?? "").trim();
  const project = (input.projectName ?? "").trim();
  const months = input.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS;
  const warranty = input.isWarranty ? `is covered under your ${months}-month warranty` : "";
  let projectPart = "";
  if (program && project) projectPart = `is on your ${program} project, ${project}`;
  else if (project) projectPart = `is on your project, ${project}`;
  else if (program) projectPart = `is on your ${program} project`;
  if (projectPart && warranty) return `This work ${projectPart}, and ${warranty}.`;
  if (warranty) return `This work ${warranty}.`;
  if (projectPart) return `This work ${projectPart}.`;
  return "";
}


/** Turn an imperative visit note into a first-person "We'll …" sentence when needed. */
function asWorkSentence(notes: string): string {
  const s = sentence(notes);
  if (!s) return "";
  if (/^(we'll|we will|our\b|the\b|this\b|during\b)/i.test(s)) return s;
  return sentence(`We'll ${s.charAt(0).toLowerCase()}${s.slice(1)}`);
}

function serviceParagraphs(input: ScheduleEmailDraftInput): string[] {
  const title = cleanVisitTitle(input.visitTitle);
  const kind = input.isWarranty ? "warranty visit" : "service visit";
  const paras: string[] = [
    title ? `We'll be on site for a ${kind}: ${title}.` : `We'll be on site for a ${kind}.`,
  ];
  const description = sentence(input.ticketDescription ?? "");
  if (description) paras.push(description);
  const notes = customerFacingNotes(input.visitNotes);
  if (notes) {
    const noteSentence = asWorkSentence(notes);
    if (noteSentence && noteSentence.toLowerCase() !== description.toLowerCase()) paras.push(noteSentence);
  }
  const coverage = coverageSentence(input);
  if (coverage) paras.push(coverage);
  return paras;
}

function officePhone(input: ScheduleEmailDraftInput): string {
  if (input.companyPhone === "") return "";
  return (input.companyPhone ?? COMPANY_PHONE).trim();
}

function pushSection(lines: string[], heading: string, value: string) {
  if (!value.trim()) return;
  if (lines.length) lines.push("");
  lines.push(`${heading}:`, value);
}

export function scheduleEmailBody(input: ScheduleEmailDraftInput): string {
  const name = greetingName(input.contactName, input.customerName);
  const date = formatVisitDate(input.startsAt);
  const window = fmtRange(input.startsAt, input.endsAt);
  const techs = input.techNames.map((n) => n.trim()).filter(Boolean);
  const address = input.address.trim();
  const duration = formatVisitDuration(input.startsAt, input.endsAt);
  const phone = officePhone(input);

  const lines: string[] = [
    `Hi ${name},`,
    "",
    `We're writing to confirm your upcoming service visit with ${COMPANY_NAME}`,
    "",
    ...serviceParagraphs(input).flatMap((p, i, all) => (i < all.length - 1 ? [p, ""] : [p])),
  ];

  pushSection(lines, "Date and arrival window", `${date}, ${window} (Central Time)`);
  pushSection(lines, techs.length > 1 ? "Assigned technicians" : "Assigned technician", techs.join(", "));
  pushSection(lines, "Service address", address);

  const expect: string[] = [
    "Please have someone on site who can give our technician access to the work area.",
  ];
  if (duration) expect.push(`The visit is scheduled for ${duration}, based on the arrival window.`);
  pushSection(lines, "What to expect", expect.join(" "));

  lines.push("");
  if (phone) {
    lines.push(`If you need to reschedule or have any questions, just reply to this email or call us at ${phone}.`);
  } else {
    lines.push("If you need to reschedule or have any questions, just reply to this email.");
  }
  lines.push("", "Thank you,", TEAM_SIGNOFF);
  return lines.join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Simple branded HTML twin of the editable plain-text body, readable on phones. */
export function scheduleEmailHtml(text: string): string {
  const body = escapeHtml(text);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Retrofit Rebates</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2423;-webkit-text-size-adjust:100%;">
  <div style="max-width:560px;margin:0 auto;padding:16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#134e4a;color:#ffffff;padding:16px 20px;font-weight:700;font-size:16px;letter-spacing:0.01em;">Retrofit Rebates, Inc.</div>
      <div style="padding:20px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${body}</div>
      <div style="padding:12px 20px 16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(COMPANY_NAME)}<br>Field service visit confirmation</div>
    </div>
  </div>
</body>
</html>`;
}

export function buildScheduleEmailDraft(opts: {
  customerEmail: string;
  creatorEmail?: string | null;
  customerName: string;
  contactName: string | null;
  visit: {
    starts_at: string;
    ends_at: string;
    assignees?: { full_name: string }[];
    title?: string | null;
    instructions?: string | null;
    notes?: string | null;
    kind?: JobKind;
  };
  address: string;
  ticketNumber?: string;
  ticketDescription?: string | null;
  isWarranty?: boolean;
  warrantyMonths?: number | null;
  projectName?: string | null;
  projectTypeLabel?: string | null;
  companyPhone?: string | null;
}): ScheduleEmailDraft {
  const to = opts.customerEmail.trim().toLowerCase();
  const creator = (opts.creatorEmail ?? "").trim().toLowerCase();
  const cc = creator && creator !== to && isValidEmail(creator) ? [creator] : [];
  const isWarranty = opts.isWarranty ?? opts.visit.kind === "warranty";
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
      visitTitle: opts.visit.title,
      visitNotes: opts.visit.instructions ?? opts.visit.notes,
      ticketDescription: opts.ticketDescription,
      isWarranty,
      warrantyMonths: opts.warrantyMonths,
      projectName: opts.projectName,
      projectTypeLabel: opts.projectTypeLabel,
      companyPhone: opts.companyPhone,
    }),
  };
}
