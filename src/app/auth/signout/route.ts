import { NextResponse, type NextRequest } from "next/server";
import { MOCK_MODE } from "@/lib/env";
import { MOCK_COOKIE } from "@/lib/auth";
import { safeNext } from "@/lib/site";

export async function POST(request: NextRequest) {
  // Optional same-site ?next (e.g. back to an AI-app consent screen after switching accounts).
  const next = safeNext(String((await request.formData().catch(() => null))?.get("next") ?? ""), "");
  const res = NextResponse.redirect(new URL(next ? `/login?next=${encodeURIComponent(next)}` : "/login", request.url), { status: 303 });
  if (MOCK_MODE) {
    res.cookies.delete(MOCK_COOKIE);
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    await (await createClient()).auth.signOut();
  }
  return res;
}
