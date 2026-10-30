import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/site";

/**
 * Email link handler (invite, password recovery, signup confirmation, magic link).
 * Supabase email templates point here with token_hash + type (see README), which
 * works even when the link is opened on a different device than it was requested from.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "invite" || type === "recovery" ? "/account/password" : "/";
  const next = safeNext(searchParams.get("next"), fallback);
  if (token_hash && type) {
    const { error } = await (await createClient()).auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That link is invalid or has expired. Request a new one with “Forgot password”.")}`);
}
