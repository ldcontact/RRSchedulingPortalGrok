import type { NextRequest } from "next/server";
import { localRedirect } from "@/lib/qbo/redirect";
import { getSessionUser } from "@/lib/auth";
import { readQboConfig } from "@/lib/qbo/config";
import { QBO_STATE_COOKIE, completeConnection, stateMatches } from "@/lib/qbo/connect";
import { QboError } from "@/lib/qbo/errors";
import { canManageQboConnection } from "@/lib/qbo/permissions";
import { qboFetch } from "@/lib/qbo/service";
import { getQboStore } from "@/lib/qbo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intuit redirects here with ?code&realmId&state. Admin only; tokens are stored encrypted server-side. */
export async function GET(req: NextRequest) {
  const done = (kind: "ok" | "error", msg: string) => {
    const res = localRedirect(`/settings/integrations?${kind}=${encodeURIComponent(msg)}`);
    res.cookies.set(QBO_STATE_COOKIE, "", { httpOnly: true, path: "/api/qbo", maxAge: 0 });
    return res;
  };
  const user = await getSessionUser();
  if (!user?.role) return localRedirect("/login");
  if (!canManageQboConnection(user.role)) return done("error", "Only an admin can connect QuickBooks.");
  const config = readQboConfig();
  if (!config) return done("error", "QuickBooks is not configured on the server yet.");
  const p = req.nextUrl.searchParams;
  if (!stateMatches(req.cookies.get(QBO_STATE_COOKIE)?.value, p.get("state"))) {
    return done("error", "QuickBooks connection expired or didn't match. Click Connect QuickBooks again.");
  }
  if (p.get("error")) {
    return done("error", p.get("error") === "access_denied" ? "QuickBooks connection was cancelled." : "QuickBooks didn't allow the connection.");
  }
  try {
    const { companyName } = await completeConnection({
      config, code: p.get("code") ?? "", realmId: p.get("realmId") ?? "",
      store: getQboStore(), fetchImpl: qboFetch(config), user: { id: user.id, name: user.name },
    });
    const tag = config.environment === "sandbox" && !/sandbox/i.test(companyName) ? " (sandbox)" : "";
    return done("ok", `Connected to ${companyName}${tag}.`);
  } catch (e) {
    return done("error", e instanceof QboError ? e.message : "Couldn't connect QuickBooks. Try again.");
  }
}
