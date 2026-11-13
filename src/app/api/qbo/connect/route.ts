import { NextResponse, type NextRequest } from "next/server";
import { localRedirect } from "@/lib/qbo/redirect";
import { getSessionUser } from "@/lib/auth";
import { readQboConfig } from "@/lib/qbo/config";
import { QBO_STATE_COOKIE, newOAuthState } from "@/lib/qbo/connect";
import { buildAuthorizeUrl } from "@/lib/qbo/oauth";
import { canManageQboConnection } from "@/lib/qbo/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (req: NextRequest, kind: "ok" | "error", msg: string) =>
  localRedirect(`/settings/integrations?${kind}=${encodeURIComponent(msg)}`);

/** Admin only: start Intuit's OAuth 2.0 authorization-code flow with a CSRF state cookie. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.role) return localRedirect("/login");
  if (!canManageQboConnection(user.role)) return back(req, "error", "Only an admin can connect QuickBooks.");
  const config = readQboConfig();
  if (!config) return back(req, "error", "QuickBooks is not configured on the server yet.");
  const state = newOAuthState();
  const res = config.fake
    ? localRedirect(`/api/qbo/callback?code=fake-code&realmId=9341455000000000&state=${state}`)
    : NextResponse.redirect(buildAuthorizeUrl(config, state));
  res.cookies.set(QBO_STATE_COOKIE, state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/qbo", maxAge: 600,
  });
  return res;
}
