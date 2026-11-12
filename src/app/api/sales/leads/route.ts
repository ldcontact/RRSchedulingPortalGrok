import { NextResponse } from "next/server";
import { getSalesRepo } from "@/lib/sales/repo";
import type { LeadSource } from "@/lib/sales/catalog";

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  const name = String(body.name ?? body.full_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const repo = await getSalesRepo();
  const item = await repo.ingestLead({
    source: "web_form",
    name,
    phone: String(body.phone ?? "") || null,
    email: String(body.email ?? "") || null,
    address: String(body.address ?? "") || null,
    city: String(body.city ?? "") || null,
    state: String(body.state ?? "IL") || null,
    zip: String(body.zip ?? "") || null,
    pipeline_slug: String(body.pipeline ?? "single_family_whe"),
    message: String(body.message ?? "") || null,
    raw: { source: "web_form" },
  });
  void (body.source as LeadSource | undefined);
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html") || ct.includes("form");
  if (wantsHtml) return NextResponse.redirect(new URL("/get-started?ok=1", req.url), 303);
  return NextResponse.json({ id: item.id, status: item.status });
}
