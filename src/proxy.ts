import { NextResponse, type NextRequest } from "next/server";
import { MOCK_MODE } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

// Optimistic check only: sends signed-out visitors to /login and keeps the
// Supabase session fresh. Real authorization happens in requireRole() on every
// page/action and in Postgres row-level security.
// /api/mcp checks its own bearer token; /.well-known is OAuth metadata; /oauth/consent sends
// signed-out visitors to /login?next=… itself so they come back to the consent screen.
// /api/cron/team-sms and /api/team/sms/inbound check CRON_SECRET / Twilio themselves.
export const PUBLIC = ["/login", "/forgot-password", "/auth/", "/not-invited", "/account/password", "/offline", "/api/mcp", "/.well-known/", "/oauth/", "/get-started", "/privacy", "/book", "/sign/", "/api/sales/leads", "/api/sales/inbound-email", "/api/sales/booking", "/api/cron/team-sms", "/api/team/sms/inbound"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  let response = NextResponse.next({ request });
  let signedIn: boolean;
  if (MOCK_MODE) {
    signedIn = request.cookies.has("rr_mock_uid");
  } else {
    ({ response, signedIn } = await updateSession(request));
  }
  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
