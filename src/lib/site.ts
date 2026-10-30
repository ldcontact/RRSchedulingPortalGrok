import "server-only";
import { headers } from "next/headers";

/** Public base URL used in auth email links. Prefer NEXT_PUBLIC_SITE_URL in production. */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next) return fallback;
  try {
    const u = new URL(next, "http://x");
    if (u.origin !== "http://x" && !/^https?:\/\//.test(next)) return fallback;
    const path = u.pathname + u.search;
    return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
  } catch {
    return fallback;
  }
}
