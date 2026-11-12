/** Parse an inbound message (plain text or a simple RFC822-ish payload) into a lead. */

export type ParsedInboundEmail = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  subject: string | null;
  message: string;
  pipeline_slug: string;
};

const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;

function header(raw: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const m = raw.match(re);
  return m ? m[1].trim() : null;
}

function displayName(from: string | null): { name: string; email: string | null } {
  if (!from) return { name: "Unknown sender", email: null };
  const angle = from.match(/^\s*"?([^"<]+)"?\s*<([^>]+)>/);
  if (angle) return { name: angle[1].trim() || angle[2], email: angle[2].trim() };
  const email = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) {
    const local = email[0].split("@")[0].replace(/[._]+/g, " ");
    const name = local.replace(/\b\w/g, (c) => c.toUpperCase());
    return { name, email: email[0] };
  }
  return { name: from, email: null };
}

function parseAddress(text: string): Pick<ParsedInboundEmail, "address" | "city" | "state" | "zip"> {
  const line = text.split(/\n/).map((s) => s.trim()).find((s) => ZIP_RE.test(s) && /IL|Illinois|,/.test(s)) ?? "";
  const zip = line.match(ZIP_RE)?.[1] ?? null;
  const m = line.match(/(.+?),\s*([^,]+),\s*([A-Z]{2})\s+\d{5}/i);
  if (m) return { address: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip };
  return { address: null, city: null, state: zip ? "IL" : null, zip };
}

function bodyOf(raw: string): string {
  const parts = raw.split(/\r?\n\r?\n/);
  if (parts.length === 1) return raw.trim();
  // If it looks like headers (has From/Subject), drop them.
  if (/^(From|Subject|To|Date):/im.test(parts[0])) return parts.slice(1).join("\n\n").trim();
  return raw.trim();
}

export function parseInboundEmail(raw: string, fallbackPipeline = "single_family_whe"): ParsedInboundEmail {
  const from = header(raw, "From");
  const subject = header(raw, "Subject");
  const body = bodyOf(raw);
  const who = displayName(from ?? body.match(/From:\s*(.+)/i)?.[1] ?? null);
  const phone = body.match(PHONE_RE)?.[0] ?? null;
  const loc = parseAddress(body);
  const message = [subject, body].filter(Boolean).join("\n\n").trim();
  return {
    name: who.name,
    email: who.email,
    phone,
    ...loc,
    subject: subject,
    message: message || "(empty message)",
    pipeline_slug: fallbackPipeline,
  };
}
