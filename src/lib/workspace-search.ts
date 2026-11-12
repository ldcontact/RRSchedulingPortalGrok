/**
 * Quick Find / workspace search helpers, shared by the repos and the modal.
 * Customer and project matching reuse parseSearch / the customer_search and
 * project_search side tables (pg_trgm indexes in 20261110230000_search_fields.sql).
 */
import { formatAddress } from "@/lib/project-row";
import { parseSearch, searchNorm, type ParsedSearch } from "@/lib/search";
import { ROLE_LABEL, type Role, type WorkspaceSearchGroup, type WorkspaceSearchHit, type WorkspaceSearchResults } from "@/lib/types";

/** Max rows shown in each Quick Find section (badge still shows the full count). */
export const WORKSPACE_SEARCH_LIMIT = 8;

export const emptyGroup = (): WorkspaceSearchGroup => ({ items: [], total: 0 });
export const emptyWorkspaceSearch = (): WorkspaceSearchResults => ({
  customers: emptyGroup(),
  projects: emptyGroup(),
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

export function flattenWorkspaceHits(r: WorkspaceSearchResults): WorkspaceSearchHit[] {
  return [...r.customers.items, ...r.projects.items, ...r.people.items];
}

export function moveActive(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}
