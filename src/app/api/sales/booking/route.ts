import { NextResponse } from "next/server";
import { getSalesRepo } from "@/lib/sales/repo";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const starts_at = String(body.starts_at ?? "");
  const ends_at = String(body.ends_at ?? "");
  if (!token || !starts_at || !ends_at) return NextResponse.json({ error: "Pick a time." }, { status: 400 });
  try {
    const deal = await (await getSalesRepo()).bookAssessment(token, { starts_at, ends_at });
    return NextResponse.json({ ok: true, assessment_date: deal.assessment_date });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not book." }, { status: 400 });
  }
}
