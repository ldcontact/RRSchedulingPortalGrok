import { NextResponse, type NextRequest } from "next/server";
import { MOCK_MODE } from "@/lib/env";
import { MOCK_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  if (MOCK_MODE) {
    res.cookies.delete(MOCK_COOKIE);
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    await (await createClient()).auth.signOut();
  }
  return res;
}
