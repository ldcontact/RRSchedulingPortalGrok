/**
 * Quick Find / workspace search helpers, shared by the repos and the modal.
 * Customer and project matching reuse parseSearch / the customer_search and
 * project_search side tables (pg_trgm indexes in 20261110230000_search_fields.sql).
 * Visits, tasks, service requests, and deals are matched with the same token-AND
 * rules against a per-row search doc (never service prices or deal values).
 */
import { formatAddress } from "@/lib/project-row";
import { parseSearch, phoneDigits, searchNorm, type ParsedSearch } from "@/lib/search";
import { fmtWhen } from "@/lib/time";
import {
  JOB_KIND_LABEL, JOB_STATUS_LABEL, ROLE_LABEL, SR_STATUS_LABEL, TASK_STATUS_LABEL, ticketNo,
  type JobKind, type JobStatus, type Role, type SRStatus, type TaskStatus,
  type WorkspaceSearchGroup, type WorkspaceSearchHit, type WorkspaceSearchResults,
} from "@/lib/types";

/** Max rows shown in each Quick Find section (badge still shows the full count). */
export const WORKSPACE_SEARCH_LIMIT = 8;

export const WORKSPACE_SEARCH_SECTIONS = [
  { key: "customers", kind: "customer", label: "Customers", empty: "No matching customers.", testId: "customers" },
  { key: "projects", kind: "project", label: "Projects", empty: "No matching projects.", testId: "projects" },
  { key: "visits", kind: "visit", label: "Visits", empty: "No matching visits.", testId: "visits" },
  { key: "serviceRequests", kind: "service_request", label: "Service requests", empty: "No matching service requests.", testId: "service-requests" },
  { key: "tasks", kind: "task", label: "Tasks", empty: "No matching tasks.", testId: "tasks" },
  { key: "deals", kind: "deal", label: "Deals", empty: "No matching deals.", testId: "deals" },
  { key: "people", kind: "person", label: "People", empty: "No matching people.", testId: "people" },
] as const;

export type WorkspaceSearchSectionKey = (typeof WORKSPACE_SEARCH_SECTIONS)[number]["key"];

export const emptyGroup = (): WorkspaceSearchGroup => ({ items: [], total: 0 });
export const emptyWorkspaceSearch = (): WorkspaceSearchResults => ({
  customers: emptyGroup(),
  projects: emptyGroup(),
  visits: emptyGroup(),
  serviceRequests: emptyGroup(),
  tasks: emptyGroup(),
  deals: emptyGroup(),
  people: emptyGroup(),
});

export function workspaceQuery(q: string | null | undefined): ParsedSearch | null {
  return parseSearch(q);
}

export function profileSearchDoc(p: { full_name: string; email: string }): string {
  return searchNorm([p.full_name, p.email].filter(Boolean).join(" "));
}

export function matchesProfile(p: { full_name: string; email: string }, s: ParsedSearch): boolean {
  const doc = profileSearchDoc(p);
  return s.tokens.every((t) => doc.includes(t));
}

export function jobNumberLabel(n: string | null | undefined): string | null {
  const v = (n ?? "").trim();
  if (!v) return null;
  return v.startsWith("#") ? `Job ${v}` : `Job #${v}`;
}

export function customerSubtitle(c: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null; email?: string | null; phone?: string | null }): string {
  return formatAddress(c) || c.email || c.phone || "";
}

export function projectSubtitle(p: { customer_name?: string | null; hcp_job_number?: string | null; address?: string | null }): string {
  return [p.customer_name, jobNumberLabel(p.hcp_job_number), p.address].filter(Boolean).join(" · ");
}

export function personSubtitle(p: { role?: Role | null; email?: string | null; title?: string | null }): string {
  const role = p.role ? ROLE_LABEL[p.role] : "Team";
  return [p.title || role, p.email].filter(Boolean).join(" · ");
}

export function personHref(opts: { profileId: string; viewerId: string; staff: boolean }): string | null {
  if (opts.staff) return "/team";
  if (opts.profileId === opts.viewerId) return "/account";
  // Techs can see teammates (profiles RLS) but have no team directory page.
  return null;
}

/** "1002" or "SR-1002" / "sr-1002" -> "1002". Used so typing a ticket number hits the row. */
export function ticketNumberFromToken(token: string): string | null {
  return /^(?:sr-?)?(\d{1,9})$/i.exec(token.trim())?.[1] ?? null;
}

export function serviceRequestSearchFields(r: {
  number: number;
  summary: string;
  description?: string | null;
  customer_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_state?: string | null;
  site_zip?: string | null;
  project_name?: string | null;
  assignee_name?: string | null;
}): { doc: string; digits: string } {
  const no = ticketNo(r.number);
  const doc = searchNorm([
    no, no.replace("-", " "), String(r.number),
    r.summary, r.description, r.customer_name, r.contact_name, r.contact_phone,
    r.site_address, r.site_city, r.site_state, r.site_zip, r.project_name, r.assignee_name,
  ].filter(Boolean).join(" "));
  const digits = [phoneDigits(r.contact_phone)].filter(Boolean).join(" ");
  return { doc, digits };
}

export function matchesServiceRequestSearch(r: Parameters<typeof serviceRequestSearchFields>[0], s: ParsedSearch): boolean {
  const { doc, digits } = serviceRequestSearchFields(r);
  if (s.digits) return doc.includes(s.text) || digits.includes(s.digits);
  return s.tokens.every((t) => {
    const num = ticketNumberFromToken(t);
    return doc.includes(t) || (num != null && String(r.number) === num);
  });
}

export function serviceRequestTitle(r: { number: number; summary: string }): string {
  return `${ticketNo(r.number)} · ${r.summary}`;
}

export function serviceRequestSubtitle(r: {
  status?: SRStatus | null;
  customer_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_state?: string | null;
  site_zip?: string | null;
}): string {
  return [
    r.status ? SR_STATUS_LABEL[r.status] : null,
    r.customer_name,
    formatAddress({ address: r.site_address, city: r.site_city, state: r.site_state, zip: r.site_zip }),
  ].filter(Boolean).join(" · ");
}

export function taskSearchDoc(t: {
  title: string;
  description?: string | null;
  assignee_names?: string[];
  project_name?: string | null;
  customer_name?: string | null;
  service_request_number?: number | null;
  service_request_summary?: string | null;
}): string {
  const sr = t.service_request_number != null ? [ticketNo(t.service_request_number), String(t.service_request_number), t.service_request_summary] : [];
  return searchNorm([t.title, t.description, ...(t.assignee_names ?? []), t.project_name, t.customer_name, ...sr].filter(Boolean).join(" "));
}

export function matchesTaskSearch(t: Parameters<typeof taskSearchDoc>[0], s: ParsedSearch): boolean {
  const doc = taskSearchDoc(t);
  return s.tokens.every((token) => doc.includes(token));
}

export function taskSubtitle(t: {
  status?: TaskStatus | null;
  assignee_names?: string[];
  project_name?: string | null;
  customer_name?: string | null;
}): string {
  const who = (t.assignee_names ?? []).filter(Boolean).join(", ") || "Unassigned";
  return [t.status ? TASK_STATUS_LABEL[t.status] : null, who, t.project_name || t.customer_name].filter(Boolean).join(" · ");
}

export function visitSearchFields(v: {
  title: string;
  kind?: JobKind | null;
  status?: JobStatus | null;
  project_name?: string | null;
  customer_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  assignee_names?: string[];
}): { doc: string; digits: string } {
  const doc = searchNorm([
    v.title,
    v.kind ? JOB_KIND_LABEL[v.kind] : null,
    v.status ? JOB_STATUS_LABEL[v.status] : null,
    v.project_name, v.customer_name, v.address, v.city, v.state, v.zip,
    ...(v.assignee_names ?? []),
  ].filter(Boolean).join(" "));
  return { doc, digits: "" };
}

export function matchesVisitSearch(v: Parameters<typeof visitSearchFields>[0], s: ParsedSearch): boolean {
  const { doc } = visitSearchFields(v);
  if (s.digits) return doc.includes(s.text);
  return s.tokens.every((t) => doc.includes(t));
}

export function visitSubtitle(v: {
  kind?: JobKind | null;
  starts_at?: string | null;
  customer_name?: string | null;
  address?: string | null;
}): string {
  return [
    v.kind ? JOB_KIND_LABEL[v.kind] : null,
    v.starts_at ? fmtWhen(v.starts_at) : null,
    v.customer_name,
    v.address,
  ].filter(Boolean).join(" · ");
}

export function dealSearchFields(d: {
  title: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): { doc: string; digits: string } {
  const doc = searchNorm([d.title, d.contact_name, d.contact_phone, d.contact_email, d.address, d.city, d.state, d.zip].filter(Boolean).join(" "));
  const digits = [phoneDigits(d.contact_phone)].filter(Boolean).join(" ");
  return { doc, digits };
}

export function matchesDealSearch(d: Parameters<typeof dealSearchFields>[0], s: ParsedSearch): boolean {
  const { doc, digits } = dealSearchFields(d);
  if (s.digits) return doc.includes(s.text) || digits.includes(s.digits);
  return s.tokens.every((t) => doc.includes(t));
}

export function dealSubtitle(d: {
  contact_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return [d.contact_name, formatAddress(d)].filter(Boolean).join(" · ");
}

export function flattenWorkspaceHits(r: WorkspaceSearchResults): WorkspaceSearchHit[] {
  return WORKSPACE_SEARCH_SECTIONS.flatMap((s) => r[s.key].items);
}

/** Keyboard-index offset of a section, skipping earlier groups (empty ones add 0). */
export function sectionHitOffset(r: WorkspaceSearchResults, key: WorkspaceSearchSectionKey): number {
  let n = 0;
  for (const s of WORKSPACE_SEARCH_SECTIONS) {
    if (s.key === key) return n;
    n += r[s.key].items.length;
  }
  return n;
}

export function moveActive(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

export function sliceGroup<T>(rows: T[]): { items: T[]; total: number } {
  return { total: rows.length, items: rows.slice(0, WORKSPACE_SEARCH_LIMIT) };
}
