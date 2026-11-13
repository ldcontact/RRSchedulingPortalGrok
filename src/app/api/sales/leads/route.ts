import { NextResponse } from "next/server";
import { getSalesRepo } from "@/lib/sales/repo";
import type { LeadSource } from "@/lib/sales/catalog";
import { hasSmsConsent, leadAllowsSubmit } from "@/lib/sales/opt-in";

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  const name = String(body.name ?? body.full_name ?? "").trim();
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html") || ct.includes("form");
  const fail = (error: string, status = 400) => {
    if (wantsHtml) return NextResponse.redirect(new URL(`/get-started?error=${encodeURIComponent(error)}`, req.url), 303);
    return NextResponse.json({ error }, { status });
  };
  if (!name) return fail("Name is required.");
  const phone = String(body.phone ?? "") || null;
  const smsConsent = hasSmsConsent(body.sms_consent ?? body.smsConsent);
  const consent = leadAllowsSubmit({ phone, smsConsent });
  if (!consent.ok) return fail(consent.error);
  const repo = await getSalesRepo();
  const item = await repo.ingestLead({
    source: "web_form",
    name,
    phone,
    email: String(body.email ?? "") || null,
    address: String(body.address ?? "") || null,
    city: String(body.city ?? "") || null,
    state: String(body.state ?? "IL") || null,
    zip: String(body.zip ?? "") || null,
    pipeline_slug: String(body.pipeline ?? "single_family_whe"),
    message: String(body.message ?? "") || null,
    raw: { source: "web_form", sms_consent: smsConsent },
  });
  void (body.source as LeadSource | undefined);
  if (wantsHtml) return NextResponse.redirect(new URL("/get-started?ok=1", req.url), 303);
  return NextResponse.json({ id: item.id, status: item.status, sms_consent: smsConsent });
}
