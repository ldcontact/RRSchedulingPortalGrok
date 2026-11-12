import { NextResponse } from "next/server";
import { getSessionUser, isStaff } from "@/lib/auth";
import { ADDRESS_SUGGEST_MIN_CHARS } from "@/lib/address-suggest";
import { allowUserQuery, completeSuggestedAddress, suggestAddresses } from "@/lib/address-suggest-server";

export const dynamic = "force-dynamic";

async function staffUser() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  if (!isStaff(user.role)) return { error: NextResponse.json({ error: "Staff only" }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const auth = await staffUser();
  if ("error" in auth && auth.error) return auth.error;
  if (!allowUserQuery(auth.user!.id)) {
    return NextResponse.json({ items: [], degraded: true }, { status: 200 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < ADDRESS_SUGGEST_MIN_CHARS) {
    return NextResponse.json({ items: [] });
  }
  try {
    const result = await suggestAddresses(q);
    return NextResponse.json(result);
  } catch {
    // Lookup failure must never block manual entry.
    return NextResponse.json({ items: [], degraded: true });
  }
}

export async function POST(req: Request) {
  const auth = await staffUser();
  if ("error" in auth && auth.error) return auth.error;
  let body: { street?: string; city?: string; state?: string; zip?: string; lat?: number | null; lng?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const item = await completeSuggestedAddress({
      street: String(body.street ?? "").trim(),
      city: String(body.city ?? "").trim(),
      state: String(body.state ?? "").trim(),
      zip: String(body.zip ?? "").trim(),
      lat: body.lat ?? null,
      lng: body.lng ?? null,
    });
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ item: null, degraded: true });
  }
}
