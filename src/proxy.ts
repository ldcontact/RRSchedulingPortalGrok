import { NextResponse, type NextRequest } from "next/server";
import { MOCK_MODE } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

// Optimistic check only: sends signed-out visitors to /login and keeps the
// Supabase session fresh. Real authorization happens in requireRole() on every
// page/action and in Postgres row-level security.
const PUBLIC = ["/login", "/forgot-password", "/auth/", "/not-invited", "/account/password", "/offline"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));

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
