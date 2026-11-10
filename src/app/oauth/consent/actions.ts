"use server";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const validId = (id: string) => /^[A-Za-z0-9._~-]{1,200}$/.test(id);

/**
 * MCP / OAuth consent decision. Supabase Auth (OAuth 2.1 server) issues the code and,
 * on token exchange, the user's normal access JWT, so the AI acts as this user under RLS.
 */
export async function decideAuthorization(authorizationId: string, approve: boolean) {
  if (!validId(authorizationId)) redirect("/oauth/consent?error=invalid");
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  const supabase = await createClient();
  // Only team members may grant access; anyone else can only decline.
  const { data, error } = approve && user.role
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect(`/oauth/consent?error=${encodeURIComponent(error?.message ?? "This sign-in request expired. Start the connection again from your AI app.")}`);
  redirect(data.redirect_url);
}
