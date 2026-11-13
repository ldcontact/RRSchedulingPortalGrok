/**
 * Live portal origin used when building absolute links (email, SMS, MCP).
 * Prefer NEXT_PUBLIC_SITE_URL / APP_URL; never fall back to the retired
 * rrschedulingportal.vercel.app project.
 */
export const DEFAULT_PORTAL_URL = "https://rr-scheduling-portal-grokv1.vercel.app";

export function publicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || DEFAULT_PORTAL_URL;
  return raw.replace(/\/$/, "");
}
