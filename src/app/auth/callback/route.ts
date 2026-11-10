import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/site";

/** OAuth (Google) and PKCE email-link callback: exchanges ?code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const err = searchParams.get("error_description");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Refresh Google avatar URL onto the profile (best-effort; DB trigger also covers metadata updates).
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const googleUrl = (user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null) as string | null;
        if (user && googleUrl) {
          const { getRepo } = await import("@/lib/data/repo");
          await (await getRepo()).syncOwnGoogleAvatar(googleUrl);
        }
      } catch {
        /* non-fatal */
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(err ?? "Sign-in link was invalid or expired.")}`);
}
