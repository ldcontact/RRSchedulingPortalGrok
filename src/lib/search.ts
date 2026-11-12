/**
 * Customers / Projects list search, shared by the Supabase repo (filters on the
 * customer_search / project_search tables, see migration 20261110230000_search_fields.sql)
 * and the dev mock repo (same rules in memory).
 *
 * - Text queries are split into words; every word must appear in the row's search text
 *   (customer name, company, contact names, email, address/city/state/zip, phone as typed,
 *   plus project name, number, type, scope and job-site address for projects).
 * - Phone-like queries ("847-555-0174", "(847) 555 0174", "8475550174", "0174") with 4+ digits
 *   also match any phone number by digits only (US leading 1 ignored).
 */
import { PROJECT_TYPE_LABEL, type ProjectType } from "@/lib/types";

export type ParsedSearch = { tokens: string[]; text: string; digits: string | null };

const MAX_TOKENS = 6;

/** Same rule as SQL private.phone_digits(): digits only, a US leading "1" dropped from 11-digit numbers. */
export function phoneDigits(t: string | null | undefined): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/** Same rule as SQL private.search_norm(): trimmed, lower-cased, single spaces. */
export const searchNorm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

/** Parse a search box value. Returns null for an empty query. Output is safe for PostgREST filters. */
export function parseSearch(q: string | null | undefined): ParsedSearch | null {
  const raw = (q ?? "").slice(0, 100);
  // drop wildcard / PostgREST grouping characters
  const text = searchNorm(raw.replace(/[%_,()"\\*]/g, " "));
  if (!text) return null;
  const isPhone = /^[\d\s\-().+]+$/.test(raw.trim());
  const digits = isPhone ? phoneDigits(raw) : null;
  return { text, tokens: text.split(" ").slice(0, MAX_TOKENS), digits: digits && digits.length >= 4 ? digits : null };
}

/** In-memory match (mock repo). doc/digits are built like the SQL side tables. */
export function matchesSearch(doc: string, digits: string, s: ParsedSearch | null): boolean {
  if (!s) return true;
  if (s.digits) return doc.includes(s.text) || digits.includes(s.digits);
  return s.tokens.every((t) => doc.includes(t));
}

type CustomerLike = { name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; tags?: string[]; company?: string | null };
type ContactLike = { name: string; phone: string | null; email: string | null };

export function customerSearchFields(c: CustomerLike, contacts: ContactLike[]) {
  const doc = searchNorm([c.name, c.company, c.email, c.phone, c.address, c.city, c.state, c.zip, ...(c.tags ?? []),
    ...contacts.flatMap((k) => [k.name, k.email, k.phone])].filter(Boolean).join(" "));
  const digits = [c.phone, ...contacts.map((k) => k.phone)].map(phoneDigits).filter(Boolean).join(" ");
  return { doc, digits };
}

type ProjectLike = { name: string; scope: string; type?: ProjectType | null; hcp_job_number?: string | null; site_address?: string | null; site_city?: string | null; site_state?: string | null; site_zip?: string | null };

export function projectSearchFields(p: ProjectLike, customer: { doc: string; digits: string }) {
  const typeDoc = p.type ? [p.type.replace(/_/g, " "), PROJECT_TYPE_LABEL[p.type]] : [];
  const doc = searchNorm([p.name, p.hcp_job_number, p.site_address, p.site_city, p.site_state, p.site_zip, customer.doc, p.scope, ...typeDoc].filter(Boolean).join(" "));
  return { doc, digits: customer.digits };
}

/** Minimal shape of a PostgREST filter builder (supabase-js) used to apply a search. */
type Filterable<Q> = { ilike(column: string, pattern: string): Q; or(filters: string, opts?: { referencedTable?: string }): Q };

/**
 * Apply a parsed search to a query that embeds `table!inner()` (customer_search / project_search).
 * Words are ANDed on doc; phone-like input matches doc OR digits.
 */
export function applySearch<Q extends Filterable<Q>>(q: Q, table: "customer_search" | "project_search", s: ParsedSearch): Q {
  if (s.digits) return q.or(`doc.ilike."%${s.text}%",digits.ilike."%${s.digits}%"`, { referencedTable: table });
  return s.tokens.reduce((acc, t) => acc.ilike(`${table}.doc`, `%${t}%`), q);
}

export const CUSTOMER_SEARCH_HINT = "Search name, contact, address, phone…";
export const PROJECT_SEARCH_HINT = "Search project #, name, type, contact, address, phone…";
